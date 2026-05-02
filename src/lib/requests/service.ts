import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentPayrollWindow, getPayrollWindowForDate, isDateInsidePayroll } from "@/lib/utils/payroll";
import {
  findEmployeeByEnrolment,
  getEmployeeById,
  getShiftById,
  getWorkplaceById,
} from "@/lib/directory/service";
import { areCareersEquivalent } from "@/lib/directory/career-equivalence";
import { assertOperatorCanEdit, operatorCanViewScope, type OperatorSession } from "@/lib/auth/operator-access";
import { runConflictCheck } from "@/lib/requests/nexti-functions";
import { type EmployeeSession } from "@/lib/auth/employee-session";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { EmployeeHistoryItem, LaunchStatus, NextiLaunchHistoryRecord, RequestType, WorkflowStatus } from "@/lib/types";

const swapSchema = z.object({
  requestType: z.literal("swap"),
  substituteEmployeeId: z.string().uuid(),
  workplaceId: z.string().uuid().optional().nullable(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  coverageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  reason: z.string().trim().min(8, "Informe uma justificativa com pelo menos 8 caracteres.").max(500),
});

const ftSchema = z.object({
  requestType: z.literal("ft"),
  workplaceId: z.string().uuid(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  shiftId: z.string().uuid(),
  turn: z.enum(["diurno", "noturno", "indefinido"]).optional(),
});

export const requestPayloadSchema = z.discriminatedUnion("requestType", [swapSchema, ftSchema]);

const cancelPayloadSchema = z.object({
  reason: z.string().trim().min(8, "Informe o motivo do cancelamento com pelo menos 8 caracteres.").max(500),
});

type PortalRequestRow = {
  id: string;
  request_type: "swap" | "ft";
  workflow_status: "submitted" | "approved" | "rejected" | "cancelled";
  launch_status: "waiting" | "matched" | "not_found" | "error";
  launch_source: "schedule_transfer" | "replacement" | "manual";
  operational_status: "pending" | "approved" | "rejected" | "cancelled" | "launched" | "launched_manual" | "corrected";
  group_key: string;
  payroll_reference: string;
  payroll_period_start: string;
  payroll_period_end: string;
  requester_employee_id: string;
  substitute_employee_id: string | null;
  requester_name: string;
  requester_enrolment: string;
  substitute_name: string | null;
  substitute_enrolment: string | null;
  workplace_name: string | null;
  request_date: string;
  coverage_date: string | null;
  reason: string;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  launched_at: string | null;
  cancel_reason: string | null;
  assigned_operator_name: string | null;
  operation_note: string | null;
  manual_authorization_note: string | null;
  ft_reason_label: string | null;
  covered_name: string | null;
  covered_enrolment: string | null;
  selected_shift_name: string | null;
  selected_shift_turn: "diurno" | "noturno" | "indefinido" | null;
};

type FtReasonRow = {
  id: string;
  label: string;
  requires_covered_employee: boolean;
  is_active: boolean;
  sort_order: number;
};

type NextiLaunchHistoryRow = Database["public"]["Tables"]["nexti_launch_history"]["Row"];

function friendlyZodError(error: z.ZodError) {
  const firstIssue = error.issues[0];
  if (!firstIssue) return "Verifique os dados informados.";

  const field = String(firstIssue.path[0] || "");
  if (field === "reason") return "Informe uma justificativa com pelo menos 8 caracteres.";
  if (field === "requestDate") return "Informe a data principal da solicitação.";
  if (field === "coverageDate") return "Informe a data de pagamento da permuta.";
  if (field === "substituteEmployeeId") return "Informe um colega válido para a permuta.";
  if (field === "workplaceId") return "Selecione uma unidade válida.";
  if (field === "shiftId") return "Selecione um horário válido.";
  return firstIssue.message || "Verifique os dados informados.";
}

function mapRequest(row: PortalRequestRow) {
  return {
    id: row.id,
    requestType: row.request_type,
    workflowStatus: row.workflow_status,
    launchStatus: row.launch_status,
    launchSource: row.launch_source,
    operationalStatus: row.operational_status,
    groupKey: row.group_key,
    payrollReference: row.payroll_reference,
    payrollPeriodStart: row.payroll_period_start,
    payrollPeriodEnd: row.payroll_period_end,
    requesterName: row.requester_name,
    requesterEnrolment: row.requester_enrolment,
    substituteName: row.substitute_name,
    substituteEnrolment: row.substitute_enrolment,
    workplaceName: row.workplace_name,
    requestDate: row.request_date,
    coverageDate: row.coverage_date,
    reason: row.reason,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    cancelledAt: row.cancelled_at,
    launchedAt: row.launched_at,
    cancelReason: row.cancel_reason,
    assignedOperatorName: row.assigned_operator_name,
    operationNote: row.operation_note,
    manualAuthorizationNote: row.manual_authorization_note,
    ftReasonLabel: row.ft_reason_label,
    coveredName: row.covered_name,
    coveredEnrolment: row.covered_enrolment,
    selectedShiftName: row.selected_shift_name,
    selectedShiftTurn: row.selected_shift_turn,
  };
}

function mapPortalEmployeeHistory(row: PortalRequestRow, employeeId: string): EmployeeHistoryItem {
  const viewerRole =
    row.requester_employee_id === employeeId
      ? "requester"
      : row.substitute_employee_id === employeeId
        ? "substitute"
        : "unknown";

  return {
    id: row.id,
    source: "portal",
    viewerRole,
    requestType: row.request_type,
    workflowStatus: row.workflow_status,
    launchStatus: row.launch_status,
    launchSource: row.launch_source,
    operationalStatus: row.operational_status,
    groupKey: row.group_key,
    payrollReference: row.payroll_reference,
    payrollPeriodStart: row.payroll_period_start,
    payrollPeriodEnd: row.payroll_period_end,
    requesterName: row.requester_name,
    requesterEnrolment: row.requester_enrolment,
    substituteName: row.substitute_name,
    substituteEnrolment: row.substitute_enrolment,
    workplaceName: row.workplace_name,
    requestDate: row.request_date,
    coverageDate: row.coverage_date,
    reason: row.request_type === "ft" ? "FT solicitada pelo colaborador." : row.reason,
    createdAt: row.created_at,
    launchedAt: row.launched_at,
    cancelReason: row.cancel_reason,
    ftReasonLabel: row.ft_reason_label,
    selectedShiftName: row.selected_shift_name,
    selectedShiftTurn: row.selected_shift_turn,
    canCancel:
      viewerRole === "requester" &&
      (row.workflow_status === "submitted" || row.workflow_status === "approved") &&
      row.launch_status !== "matched",
  };
}

function mapNextiEmployeeHistory(row: NextiLaunchHistoryRow): EmployeeHistoryItem {
  return {
    id: row.id,
    source: "nexti",
    viewerRole: "requester",
    requestType: row.request_type,
    workflowStatus: "approved",
    launchStatus: "matched",
    launchSource: row.nexti_source,
    operationalStatus: "launched",
    groupKey: row.group_key,
    payrollReference: row.payroll_reference,
    payrollPeriodStart: row.payroll_period_start,
    payrollPeriodEnd: row.payroll_period_end,
    requesterName: row.requester_name,
    requesterEnrolment: row.requester_enrolment,
    substituteName: row.substitute_name,
    substituteEnrolment: row.substitute_enrolment,
    workplaceName: row.workplace_name,
    requestDate: row.request_date,
    coverageDate: row.coverage_date,
    reason: row.request_type === "swap" ? "Permuta (Troca de Folga) já lançada na Nexti." : "FT já lançada na Nexti.",
    createdAt: row.nexti_created_at || row.created_at,
    launchedAt: row.nexti_last_update || row.created_at,
    cancelReason: null,
    ftReasonLabel: row.request_type === "ft" ? "Histórico Nexti" : null,
    selectedShiftName: row.shift_name,
    selectedShiftTurn: null,
    canCancel: false,
  };
}

function mapNextiLaunchHistory(row: NextiLaunchHistoryRow): NextiLaunchHistoryRecord {
  return {
    id: row.id,
    requestType: row.request_type,
    nextiSource: row.nexti_source,
    nextiRecordId: row.nexti_record_id,
    groupKey: row.group_key,
    payrollReference: row.payroll_reference,
    requesterName: row.requester_name,
    requesterEnrolment: row.requester_enrolment,
    requesterIsActive: row.requester_is_active,
    substituteName: row.substitute_name,
    substituteEnrolment: row.substitute_enrolment,
    companyId: row.company_id,
    companyName: row.company_name,
    careerId: row.career_id,
    careerName: row.career_name,
    scheduleId: row.schedule_id,
    scheduleName: row.schedule_name,
    shiftId: row.shift_id,
    shiftName: row.shift_name,
    workplaceId: row.workplace_id,
    workplaceName: row.workplace_name,
    requestDate: row.request_date,
    coverageDate: row.coverage_date,
    nextiCreatedAt: row.nexti_created_at,
    nextiLastUpdate: row.nexti_last_update,
  };
}

async function appendEvent(input: {
  requestId: string;
  actorType: "employee" | "operator" | "system";
  actorId?: string | null;
  actorLabel?: string | null;
  eventType: string;
  payload?: Json;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from("request_events").insert({
    request_id: input.requestId,
    actor_type: input.actorType,
    actor_id: input.actorId || null,
    actor_label: input.actorLabel || null,
    event_type: input.eventType,
    payload: input.payload || {},
  });
}

async function ensureOpenDuplicateFree(params: {
  requesterEmployeeId: string;
  substituteEmployeeId?: string | null;
  requestDate: string;
  coverageDate?: string | null;
  requestType: "swap" | "ft";
}) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("portal_requests")
    .select("id")
    .eq("request_type", params.requestType)
    .eq("requester_employee_id", params.requesterEmployeeId)
    .in("workflow_status", ["submitted", "approved"])
    .neq("launch_status", "matched")
    .eq("request_date", params.requestDate);

  if (params.requestType === "swap") {
    query = query
      .eq("substitute_employee_id", params.substituteEmployeeId || "")
      .eq("coverage_date", params.coverageDate || "");
  }

  const { data } = await query.limit(1);
  if ((data || []).length > 0) {
    throw new Error("Já existe uma solicitação aberta com os mesmos participantes e datas.");
  }
}

function localWorkState(
  employee: { rotationCode: number | null; fullName: string },
  isoDate: string,
) {
  if (![1, 2].includes(Number(employee.rotationCode))) {
    return { known: false, works: false };
  }

  const day = Number(isoDate.slice(8, 10));
  const dayIsEven = day % 2 === 0;
  const works = Number(employee.rotationCode) === 2 ? dayIsEven : !dayIsEven;
  return { known: true, works };
}

function assertLocalSwapSchedule(input: {
  requester: { rotationCode: number | null; fullName: string };
  substitute: { rotationCode: number | null; fullName: string };
  requestDate: string;
  coverageDate: string;
}) {
  const requesterPrimary = localWorkState(input.requester, input.requestDate);
  const substitutePrimary = localWorkState(input.substitute, input.requestDate);
  const requesterCoverage = localWorkState(input.requester, input.coverageDate);
  const substituteCoverage = localWorkState(input.substitute, input.coverageDate);

  if (requesterPrimary.known && requesterPrimary.works) {
    throw new Error("A data da folga está inválida: você está escalado para trabalhar neste dia.");
  }
  if (substitutePrimary.known && !substitutePrimary.works) {
    throw new Error("O colega informado não está escalado para trabalhar na data da sua folga.");
  }
  if (requesterCoverage.known && !requesterCoverage.works) {
    throw new Error("A data de pagamento está inválida: você não está escalado para trabalhar neste dia.");
  }
  if (substituteCoverage.known && substituteCoverage.works) {
    throw new Error("A data de pagamento está inválida: o colega já está escalado para trabalhar neste dia.");
  }
}

function assertLocalFtSchedule(input: {
  requester: { rotationCode: number | null; fullName: string };
  requestDate: string;
}) {
  const requesterPrimary = localWorkState(input.requester, input.requestDate);
  if (requesterPrimary.known && requesterPrimary.works) {
    throw new Error("A FT precisa ser solicitada para uma data de folga do colaborador.");
  }
}

function todayIsoDate(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function assertDateIsNotPast(date: string, label: string) {
  if (date < todayIsoDate()) {
    throw new Error(`${label} já passou. Escolha uma data de hoje em diante.`);
  }
}

export async function createPortalRequest(
  session: EmployeeSession,
  rawPayload: unknown,
) {
  const parsed = requestPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new Error(friendlyZodError(parsed.error));
  }

  const payload = parsed.data;
  const requester = await getEmployeeById(session.employeeId);

  if (!requester || !requester.isActive) {
    throw new Error("Colaborador não localizado ou inativo.");
  }

  const currentPayroll = getCurrentPayrollWindow();
  const requestPayroll = getPayrollWindowForDate(payload.requestDate);

  assertDateIsNotPast(
    payload.requestDate,
    payload.requestType === "swap" ? "A data em que você vai trabalhar" : "A data da FT",
  );

  if (payload.requestType === "swap") {
    assertDateIsNotPast(payload.coverageDate, "A data em que você vai folgar");
  }

  if (requestPayroll.reference !== currentPayroll.reference) {
    throw new Error("A solicitação deve estar dentro da folha atual.");
  }

  if (!isDateInsidePayroll(payload.requestDate, currentPayroll)) {
    throw new Error("A data principal está fora da folha atual.");
  }

  if (payload.requestType === "swap" && !isDateInsidePayroll(payload.coverageDate, currentPayroll)) {
    throw new Error("A data de compensação está fora da folha atual.");
  }

  if (payload.requestType === "swap" && payload.requestDate === payload.coverageDate) {
    throw new Error("As datas da permuta não podem ser iguais.");
  }

  const workplace = payload.workplaceId ? await getWorkplaceById(payload.workplaceId) : null;
  if (payload.requestType === "ft" && !workplace) {
    throw new Error("Selecione uma unidade válida para o lançamento de FT.");
  }

  if (workplace && (workplace.groupKey !== requester.groupKey || workplace.companyId !== requester.companyId)) {
    throw new Error("A unidade escolhida não pertence ao mesmo grupo e empresa do colaborador.");
  }

  const selectedShift = payload.requestType === "ft" ? await getShiftById(payload.shiftId) : null;
  if (payload.requestType === "ft" && !selectedShift) {
    throw new Error("Selecione um horário válido para a FT.");
  }

  if (selectedShift?.isPreAssigned) {
    throw new Error("Horários pré-assinalados não podem ser usados para solicitação de FT.");
  }

  let substitute = null;
  if (payload.requestType === "swap") {
    substitute = await getEmployeeById(payload.substituteEmployeeId);
    if (!substitute || !substitute.isActive) {
      throw new Error("O colaborador da permuta não está ativo.");
    }

    if (substitute.groupKey !== requester.groupKey || substitute.companyId !== requester.companyId) {
      throw new Error("A permuta só pode ocorrer entre colaboradores da mesma empresa e grupo.");
    }

    if (substitute.workplaceId !== requester.workplaceId) {
      throw new Error("A permuta deve ocorrer entre colaboradores do mesmo posto/unidade.");
    }

    if (substitute.rotationCode !== null && requester.rotationCode !== null && substitute.rotationCode === requester.rotationCode) {
      throw new Error("Troca inválida: não é possível permutar com colaborador da mesma escala/turma.");
    }

    const sameCareerGroup = await areCareersEquivalent(
      {
        groupKey: requester.groupKey,
        careerId: requester.careerId,
        careerName: requester.careerName,
      },
      {
        groupKey: substitute.groupKey,
        careerId: substitute.careerId,
        careerName: substitute.careerName,
      },
    );

    if (!sameCareerGroup) {
      throw new Error("A permuta só pode ocorrer entre colaboradores do mesmo grupo de cargo.");
    }

    assertLocalSwapSchedule({
      requester,
      substitute,
      requestDate: payload.requestDate,
      coverageDate: payload.coverageDate,
    });

    await ensureOpenDuplicateFree({
      requesterEmployeeId: requester.id,
      substituteEmployeeId: substitute.id,
      requestDate: payload.requestDate,
      coverageDate: payload.coverageDate,
      requestType: payload.requestType,
    });
  } else {
    assertLocalFtSchedule({
      requester,
      requestDate: payload.requestDate,
    });

    await ensureOpenDuplicateFree({
      requesterEmployeeId: requester.id,
      requestDate: payload.requestDate,
      requestType: payload.requestType,
    });
  }

  const conflictCheck = await runConflictCheck({
    requestType: payload.requestType,
    requester: {
      personExternalId: requester.personExternalId,
      fullName: requester.fullName,
    },
    substitute: substitute
      ? {
          personExternalId: substitute.personExternalId,
          fullName: substitute.fullName,
        }
      : null,
    workplaceExternalId: workplace?.workplaceExternalId || requester.workplaceExternalId || null,
    workplaceName: workplace?.name || requester.workplaceName || null,
    requestDate: payload.requestDate,
    coverageDate: payload.requestType === "swap" ? payload.coverageDate : null,
    reason: payload.requestType === "swap" ? payload.reason : "FT solicitada pelo colaborador.",
  });

  if (!conflictCheck.ok) {
    throw new Error(conflictCheck.issues.join(" "));
  }

  const admin = createSupabaseAdminClient();
  const insertPayload: Database["public"]["Tables"]["portal_requests"]["Insert"] = {
    request_type: payload.requestType,
    workflow_status: "submitted",
    launch_status: "waiting",
    operational_status: "pending",
    launch_source: payload.requestType === "swap" ? "schedule_transfer" : "replacement",
    group_key: requester.groupKey,
    payroll_reference: currentPayroll.reference,
    payroll_period_start: currentPayroll.periodStart,
    payroll_period_end: currentPayroll.periodEnd,
    requester_employee_id: requester.id,
    substitute_employee_id: substitute?.id || null,
    requester_nexti_person_id: requester.nextiPersonId,
    substitute_nexti_person_id: substitute?.nextiPersonId || null,
    requester_person_external_id: requester.personExternalId,
    substitute_person_external_id: substitute?.personExternalId || null,
    requester_name: requester.fullName,
    requester_enrolment: requester.enrolment,
    substitute_name: substitute?.fullName || null,
    substitute_enrolment: substitute?.enrolment || null,
    company_id: requester.companyId,
    company_name: requester.companyName,
    career_id: requester.careerId,
    career_name: requester.careerName || "Cargo não informado",
    schedule_id: requester.scheduleId,
    schedule_name: requester.scheduleName,
    shift_id: payload.requestType === "ft" ? selectedShift?.nextiShiftId || requester.shiftId : requester.shiftId,
    shift_name: payload.requestType === "ft" ? selectedShift?.name || requester.shiftName : requester.shiftName,
    workplace_id: workplace?.nextiWorkplaceId || requester.workplaceId || null,
    workplace_external_id: workplace?.workplaceExternalId || requester.workplaceExternalId || null,
    workplace_name: workplace?.name || requester.workplaceName || null,
    request_date: payload.requestDate,
    coverage_date: payload.requestType === "swap" ? payload.coverageDate : null,
    reason: payload.requestType === "swap" ? payload.reason.trim() : "",
    selected_shift_directory_id: payload.requestType === "ft" ? selectedShift?.id || null : null,
    selected_shift_id: payload.requestType === "ft" ? selectedShift?.nextiShiftId || null : null,
    selected_shift_external_id: payload.requestType === "ft" ? selectedShift?.shiftExternalId || null : null,
    selected_shift_name: payload.requestType === "ft" ? selectedShift?.name || null : null,
    selected_shift_turn: payload.requestType === "ft" ? selectedShift?.turn || payload.turn || "indefinido" : null,
    validation_summary: (conflictCheck.summary || {}) as Json,
    request_snapshot: {
      requester,
      substitute,
      workplace: workplace || null,
      selectedShift,
      form: payload,
    } as Json,
    nexti_payload: (conflictCheck.nextiPayload || {}) as Json,
  };

  const { data, error } = await admin
    .from("portal_requests")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Não foi possível registrar a solicitação.");
  }

  await appendEvent({
    requestId: data.id as string,
    actorType: "employee",
    actorId: requester.id,
    actorLabel: requester.fullName,
    eventType: "submitted",
    payload: {
      requestType: payload.requestType,
      requestDate: payload.requestDate,
      coverageDate: payload.requestType === "swap" ? payload.coverageDate : null,
    },
  });

  return mapRequest(data as PortalRequestRow);
}

export async function listEmployeeRequests(
  session: EmployeeSession,
  payrollReference?: string,
  requestType?: "all" | RequestType,
) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("portal_requests")
    .select("*")
    .or(`requester_employee_id.eq.${session.employeeId},substitute_employee_id.eq.${session.employeeId}`)
    .order("created_at", { ascending: false });

  if (payrollReference) {
    query = query.eq("payroll_reference", payrollReference);
  }

  if (requestType && requestType !== "all") {
    query = query.eq("request_type", requestType);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Não foi possível consultar as solicitações.");
  }

  return ((data || []) as PortalRequestRow[]).map(mapRequest);
}

export async function listEmployeeHistory(
  session: EmployeeSession,
  payrollReference?: string,
  requestType?: "all" | RequestType,
) {
  const admin = createSupabaseAdminClient();
  const employee = await getEmployeeById(session.employeeId);
  if (!employee || !employee.isActive) {
    throw new Error("Colaborador não encontrado ou inativo.");
  }

  let portalQuery = admin
    .from("portal_requests")
    .select("*")
    .or(`requester_employee_id.eq.${session.employeeId},substitute_employee_id.eq.${session.employeeId}`);

  const historyLookupFilters = [
    `requester_employee_id.eq.${session.employeeId}`,
    `requester_nexti_person_id.eq.${employee.nextiPersonId}`,
    employee.personExternalId ? `requester_person_external_id.eq.${employee.personExternalId}` : null,
  ].filter(Boolean);

  let nextiQuery = admin
    .from("nexti_launch_history")
    .select("*")
    .or(historyLookupFilters.join(","));

  if (payrollReference) {
    portalQuery = portalQuery.eq("payroll_reference", payrollReference);
    nextiQuery = nextiQuery.eq("payroll_reference", payrollReference);
  }

  if (requestType && requestType !== "all") {
    portalQuery = portalQuery.eq("request_type", requestType);
    nextiQuery = nextiQuery.eq("request_type", requestType);
  }

  if (employee.admissionDate) {
    nextiQuery = nextiQuery.gte("request_date", employee.admissionDate);
  }

  const [portalResult, nextiResult] = await Promise.all([
    portalQuery.order("created_at", { ascending: false }),
    nextiQuery.order("request_date", { ascending: false }),
  ]);

  if (portalResult.error || nextiResult.error) {
    throw new Error("Não foi possível consultar o histórico.");
  }

  return [
    ...((portalResult.data || []) as PortalRequestRow[]).map((row) =>
      mapPortalEmployeeHistory(row, session.employeeId),
    ),
    ...((nextiResult.data || []) as NextiLaunchHistoryRow[]).map(mapNextiEmployeeHistory),
  ].sort((left, right) => {
    const leftTime = new Date(left.createdAt || left.requestDate).getTime();
    const rightTime = new Date(right.createdAt || right.requestDate).getTime();
    return rightTime - leftTime;
  });
}

export async function cancelPortalRequest(session: EmployeeSession, requestId: string, rawPayload: unknown) {
  const parsed = cancelPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Informe o motivo do cancelamento.");
  }

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("portal_requests")
    .select("*")
    .eq("id", requestId)
    .eq("requester_employee_id", session.employeeId)
    .single();

  if (!row) {
    throw new Error("Solicitação não encontrada.");
  }

  if (row.launch_status === "matched") {
    throw new Error("Essa solicitação já foi lançada e não pode ser cancelada pelo portal.");
  }

  if (row.workflow_status === "cancelled" || row.workflow_status === "rejected") {
    throw new Error("Essa solicitação não está mais aberta para cancelamento.");
  }

  const { data, error } = await admin
    .from("portal_requests")
    .update({
      workflow_status: "cancelled",
      operational_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_employee_id: session.employeeId,
      cancel_reason: parsed.data.reason,
    })
    .eq("id", requestId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Não foi possível cancelar a solicitação.");
  }

  await appendEvent({
    requestId,
    actorType: "employee",
    actorId: session.employeeId,
    actorLabel: session.fullName,
    eventType: "cancelled",
    payload: {
      reason: parsed.data.reason,
    },
  });

  return mapRequest(data as PortalRequestRow);
}

type OperatorFilterInput = {
  page?: number;
  limit?: number;
  groupKey?: string;
  requestType?: "swap" | "ft";
  workflowStatus?: WorkflowStatus;
  launchStatus?: LaunchStatus;
  payrollReference?: string;
  companyId?: string;
  careerId?: string;
  scheduleId?: string;
  shiftId?: string;
  workplaceId?: string;
  search?: string;
};

type OperatorLaunchHistoryFilterInput = OperatorFilterInput & {
  includeInactive?: boolean;
};

export async function listOperatorRequests(filters: OperatorFilterInput, operator?: OperatorSession) {
  const admin = createSupabaseAdminClient();
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin
    .from("portal_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (operator && operator.role !== "admin" && !operator.canViewAll) {
    if (operator.viewGroupKeys.length > 0) {
      query = query.in("group_key", operator.viewGroupKeys);
    } else if (operator.viewCompanyIds.length > 0) {
      query = query.in("company_id", operator.viewCompanyIds);
    } else {
      return {
        items: [],
        page,
        limit,
        total: 0,
      };
    }
  }

  if (filters.groupKey) query = query.eq("group_key", filters.groupKey);
  if (filters.requestType) query = query.eq("request_type", filters.requestType);
  if (filters.workflowStatus) query = query.eq("workflow_status", filters.workflowStatus);
  if (filters.launchStatus) query = query.eq("launch_status", filters.launchStatus);
  if (filters.payrollReference) query = query.eq("payroll_reference", filters.payrollReference);
  if (filters.companyId) query = query.eq("company_id", Number(filters.companyId));
  if (filters.careerId) query = query.eq("career_id", Number(filters.careerId));
  if (filters.scheduleId) query = query.eq("schedule_id", Number(filters.scheduleId));
  if (filters.shiftId) query = query.eq("shift_id", Number(filters.shiftId));
  if (filters.workplaceId) query = query.eq("workplace_id", Number(filters.workplaceId));

  const search = String(filters.search || "").trim();
  if (search) {
    query = query.or(
      `requester_name.ilike.%${search}%,substitute_name.ilike.%${search}%,requester_enrolment.ilike.%${search}%,substitute_enrolment.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error("Não foi possível consultar a fila operacional.");
  }

  return {
    items: ((data || []) as PortalRequestRow[]).map(mapRequest),
    page,
    limit,
    total: count || 0,
  };
}

export async function listOperatorLaunchHistory(filters: OperatorLaunchHistoryFilterInput, operator?: OperatorSession) {
  const admin = createSupabaseAdminClient();
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin
    .from("nexti_launch_history")
    .select("*", { count: "exact" })
    .order("request_date", { ascending: false })
    .range(from, to);

  if (!filters.includeInactive) {
    query = query.eq("requester_is_active", true);
  }

  if (operator && operator.role !== "admin" && !operator.canViewAll) {
    if (operator.viewGroupKeys.length > 0) {
      query = query.in("group_key", operator.viewGroupKeys);
    } else if (operator.viewCompanyIds.length > 0) {
      query = query.in("company_id", operator.viewCompanyIds);
    } else {
      return {
        items: [],
        page,
        limit,
        total: 0,
      };
    }
  }

  if (filters.groupKey) query = query.eq("group_key", filters.groupKey);
  if (filters.requestType) query = query.eq("request_type", filters.requestType);
  if (filters.payrollReference) query = query.eq("payroll_reference", filters.payrollReference);
  if (filters.companyId) query = query.eq("company_id", Number(filters.companyId));
  if (filters.careerId) query = query.eq("career_id", Number(filters.careerId));
  if (filters.scheduleId) query = query.eq("schedule_id", Number(filters.scheduleId));
  if (filters.shiftId) query = query.eq("shift_id", Number(filters.shiftId));
  if (filters.workplaceId) query = query.eq("workplace_id", Number(filters.workplaceId));

  const search = String(filters.search || "").trim();
  if (search) {
    query = query.or(
      `requester_name.ilike.%${search}%,substitute_name.ilike.%${search}%,requester_enrolment.ilike.%${search}%,substitute_enrolment.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error("Não foi possível consultar histórico Nexti.");
  }

  return {
    items: ((data || []) as NextiLaunchHistoryRow[]).map(mapNextiLaunchHistory),
    page,
    limit,
    total: count || 0,
  };
}


const manualSwapSchema = z.object({
  requestType: z.literal("swap"),
  requesterEnrolment: z.string().trim().min(1),
  substituteEnrolment: z.string().trim().min(1),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  manualAuthorizationNote: z.string().trim().min(8).max(800),
  operationNote: z.string().trim().max(800).optional(),
});

const manualFtSchema = z.object({
  requestType: z.literal("ft"),
  requesterEnrolment: z.string().trim().min(1),
  workplaceId: z.string().uuid(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.string().uuid(),
  ftReasonId: z.string().uuid(),
  coveredEnrolment: z.string().trim().optional(),
  manualAuthorizationNote: z.string().trim().min(8).max(800),
  operationNote: z.string().trim().max(800).optional(),
});

const manualRequestSchema = z.discriminatedUnion("requestType", [manualSwapSchema, manualFtSchema]);

const operationStatusSchema = z.object({
  action: z.enum(["manual_launch", "cancel", "correct"]),
  note: z.string().trim().min(4).max(800),
});

function getPayrollForManualDate(date: string) {
  const payroll = getPayrollWindowForDate(date);
  return {
    reference: payroll.reference,
    periodStart: payroll.periodStart,
    periodEnd: payroll.periodEnd,
  };
}

async function getFtReasonById(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ft_reasons")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error("Selecione um motivo operacional de FT válido.");
  }

  return data as FtReasonRow;
}

export async function listFtReasons() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ft_reasons")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("label");

  if (error) {
    throw new Error("Não foi possível listar motivos de FT.");
  }

  return ((data || []) as FtReasonRow[]).map((reason) => ({
    id: reason.id,
    label: reason.label,
    requiresCoveredEmployee: reason.requires_covered_employee,
  }));
}

export async function createManualPortalRequest(operator: OperatorSession, rawPayload: unknown) {
  const payload = manualRequestSchema.parse(rawPayload);
  const requester = await findEmployeeByEnrolment(payload.requesterEnrolment, { activeOnly: true });
  if (!requester) {
    throw new Error("RE do colaborador não encontrado ou inativo.");
  }

  assertOperatorCanEdit(operator, {
    groupKey: requester.groupKey,
    companyId: requester.companyId,
  });

  const now = new Date().toISOString();
  const payroll = getPayrollForManualDate(payload.requestDate);
  const admin = createSupabaseAdminClient();
  let substitute = null;
  let workplace = null;
  let selectedShift = null;
  let ftReason: FtReasonRow | null = null;
  let coveredEmployee = null;

  if (payload.requestType === "swap") {
    if (payload.requestDate === payload.coverageDate) {
      throw new Error("As datas da permuta não podem ser iguais.");
    }

    substitute = await findEmployeeByEnrolment(payload.substituteEnrolment, {
      groupKey: requester.groupKey,
      activeOnly: true,
    });
    if (!substitute) {
      throw new Error("RE do colega não encontrado ou inativo.");
    }
  } else {
    workplace = await getWorkplaceById(payload.workplaceId);
    if (!workplace) {
      throw new Error("Selecione uma unidade válida.");
    }

    selectedShift = await getShiftById(payload.shiftId);
    if (!selectedShift || selectedShift.isPreAssigned) {
      throw new Error("Selecione um horário válido e sem pré-assinalado.");
    }

    ftReason = await getFtReasonById(payload.ftReasonId);
    const coveredEnrolment = String(payload.coveredEnrolment || "").trim();
    if (ftReason.requires_covered_employee && !coveredEnrolment) {
      throw new Error("Este motivo exige informar o RE de quem foi coberto.");
    }

    if (coveredEnrolment) {
      coveredEmployee = await findEmployeeByEnrolment(coveredEnrolment, {
        groupKey: requester.groupKey,
        activeOnly: true,
      });
      if (!coveredEmployee) {
        throw new Error("RE do colaborador coberto não encontrado ou inativo.");
      }
    }
  }

  const insertPayload: Database["public"]["Tables"]["portal_requests"]["Insert"] = {
    request_type: payload.requestType,
    workflow_status: "approved",
    launch_status: "matched",
    launch_source: "manual",
    operational_status: "launched_manual",
    origin: "operator-manual",
    group_key: requester.groupKey,
    payroll_reference: payroll.reference,
    payroll_period_start: payroll.periodStart,
    payroll_period_end: payroll.periodEnd,
    requester_employee_id: requester.id,
    substitute_employee_id: substitute?.id || null,
    requester_nexti_person_id: requester.nextiPersonId,
    substitute_nexti_person_id: substitute?.nextiPersonId || null,
    requester_person_external_id: requester.personExternalId,
    substitute_person_external_id: substitute?.personExternalId || null,
    requester_name: requester.fullName,
    requester_enrolment: requester.enrolment,
    substitute_name: substitute?.fullName || null,
    substitute_enrolment: substitute?.enrolment || null,
    company_id: requester.companyId,
    company_name: requester.companyName,
    career_id: requester.careerId,
    career_name: requester.careerName || "Cargo não informado",
    schedule_id: requester.scheduleId,
    schedule_name: requester.scheduleName,
    shift_id: payload.requestType === "ft" ? selectedShift?.nextiShiftId || requester.shiftId : requester.shiftId,
    shift_name: payload.requestType === "ft" ? selectedShift?.name || requester.shiftName : requester.shiftName,
    workplace_id: payload.requestType === "ft" ? workplace?.nextiWorkplaceId || null : requester.workplaceId,
    workplace_external_id:
      payload.requestType === "ft" ? workplace?.workplaceExternalId || null : requester.workplaceExternalId,
    workplace_name: payload.requestType === "ft" ? workplace?.name || null : requester.workplaceName,
    request_date: payload.requestDate,
    coverage_date: payload.requestType === "swap" ? payload.coverageDate : null,
    reason: payload.requestType === "swap" ? payload.manualAuthorizationNote : "",
    approved_at: now,
    approved_by: operator.userId,
    launched_at: now,
    assigned_operator_user_id: operator.userId,
    assigned_operator_name: operator.fullName,
    operation_note: payload.operationNote || null,
    manual_authorization_note: payload.manualAuthorizationNote,
    manual_created_by: operator.userId,
    manual_created_at: now,
    manual_launched_by: operator.userId,
    manual_launched_at: now,
    ft_reason_id: payload.requestType === "ft" ? ftReason?.id || null : null,
    ft_reason_label: payload.requestType === "ft" ? ftReason?.label || null : null,
    covered_employee_id: coveredEmployee?.id || null,
    covered_nexti_person_id: coveredEmployee?.nextiPersonId || null,
    covered_person_external_id: coveredEmployee?.personExternalId || null,
    covered_name: coveredEmployee?.fullName || null,
    covered_enrolment: coveredEmployee?.enrolment || null,
    selected_shift_directory_id: payload.requestType === "ft" ? selectedShift?.id || null : null,
    selected_shift_id: payload.requestType === "ft" ? selectedShift?.nextiShiftId || null : null,
    selected_shift_external_id: payload.requestType === "ft" ? selectedShift?.shiftExternalId || null : null,
    selected_shift_name: payload.requestType === "ft" ? selectedShift?.name || null : null,
    selected_shift_turn: payload.requestType === "ft" ? selectedShift?.turn || "indefinido" : null,
    validation_summary: {
      mode: "manual_exception",
      operator: operator.email,
    } as Json,
    request_snapshot: {
      requester,
      substitute,
      workplace,
      selectedShift,
      ftReason,
      coveredEmployee,
      form: payload,
    } as Json,
    nexti_payload: {},
    nexti_match_payload: {
      source: "manual",
      operatorUserId: operator.userId,
      at: now,
    } as Json,
  };

  const { data, error } = await admin
    .from("portal_requests")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Não foi possível criar o lançamento manual.");
  }

  await appendEvent({
    requestId: data.id as string,
    actorType: "operator",
    actorId: operator.userId,
    actorLabel: operator.fullName,
    eventType: "manual_created",
    payload: {
      requestType: payload.requestType,
      note: payload.manualAuthorizationNote,
    },
  });

  return mapRequest(data as PortalRequestRow);
}

export async function updatePortalRequestOperationStatus(
  operator: OperatorSession,
  requestId: string,
  rawPayload: unknown,
) {
  const payload = operationStatusSchema.parse(rawPayload);
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from("portal_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!row) {
    throw new Error("Solicitação não encontrada.");
  }

  assertOperatorCanEdit(operator, {
    groupKey: row.group_key as string,
    companyId: row.company_id ? Number(row.company_id) : null,
  });

  let update: Database["public"]["Tables"]["portal_requests"]["Update"];
  let eventType: string;
  if (payload.action === "manual_launch") {
    update = {
      workflow_status: "approved",
      launch_status: "matched",
      launch_source: "manual",
      operational_status: "launched_manual",
      approved_at: row.approved_at || now,
      approved_by: (row.approved_by as string | null) || operator.userId,
      launched_at: now,
      manual_authorization_note: payload.note,
      manual_launched_by: operator.userId,
      manual_launched_at: now,
      operation_note: payload.note,
      assigned_operator_user_id: operator.userId,
      assigned_operator_name: operator.fullName,
      nexti_match_payload: {
        source: "manual",
        operatorUserId: operator.userId,
        at: now,
        note: payload.note,
      } as Json,
    };
    eventType = "manual_launch_matched";
  } else if (payload.action === "cancel") {
    update = {
      workflow_status: "cancelled",
      operational_status: "cancelled",
      cancelled_at: now,
      cancel_reason: payload.note,
      operation_note: payload.note,
      assigned_operator_user_id: operator.userId,
      assigned_operator_name: operator.fullName,
    };
    eventType = "operator_cancelled";
  } else {
    update = {
      operational_status: "corrected",
      operation_note: payload.note,
      assigned_operator_user_id: operator.userId,
      assigned_operator_name: operator.fullName,
    };
    eventType = "operator_corrected";
  }

  const { data, error } = await admin
    .from("portal_requests")
    .update(update)
    .eq("id", requestId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Não foi possível atualizar o status operacional.");
  }

  await appendEvent({
    requestId,
    actorType: "operator",
    actorId: operator.userId,
    actorLabel: operator.fullName,
    eventType,
    payload: {
      note: payload.note,
      action: payload.action,
    },
  });

  return mapRequest(data as PortalRequestRow);
}

export async function getOperatorRequestDetail(requestId: string, operator?: OperatorSession) {
  const admin = createSupabaseAdminClient();
  const [{ data: request }, { data: events }] = await Promise.all([
    admin.from("portal_requests").select("*").eq("id", requestId).single(),
    admin
      .from("request_events")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false }),
  ]);

  if (!request) {
    return null;
  }

  if (
    operator &&
    !operatorCanViewScope(operator, {
      groupKey: String(request.group_key || ""),
      companyId: request.company_id ? Number(request.company_id) : null,
    })
  ) {
    return null;
  }

  return {
    request: mapRequest(request as PortalRequestRow),
    rawRequest: request,
    events: events || [],
  };
}

export async function reviewPortalRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  note?: string;
  operator: OperatorSession;
}) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from("portal_requests")
    .select("*")
    .eq("id", input.requestId)
    .single();

  if (!row) {
    throw new Error("Solicitação não encontrada.");
  }

  if (row.launch_status === "matched") {
    throw new Error("A solicitação já consta como lançada.");
  }

  assertOperatorCanEdit(input.operator, {
    groupKey: row.group_key as string,
    companyId: row.company_id ? Number(row.company_id) : null,
  });

  const nextState: Database["public"]["Tables"]["portal_requests"]["Update"] =
    input.decision === "approve"
      ? {
          workflow_status: "approved",
          operational_status: "approved",
          approved_at: now,
          approved_by: input.operator.userId,
        }
      : {
          workflow_status: "rejected",
          operational_status: "rejected",
          rejected_at: now,
          rejected_by: input.operator.userId,
        };

  const { data, error } = await admin
    .from("portal_requests")
    .update(nextState)
    .eq("id", input.requestId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Não foi possível registrar a revisão.");
  }

  await appendEvent({
    requestId: input.requestId,
    actorType: "operator",
    actorId: input.operator.userId,
    actorLabel: input.operator.fullName,
    eventType: input.decision === "approve" ? "approved" : "rejected",
    payload: {
      note: input.note || null,
    },
  });

  return mapRequest(data as PortalRequestRow);
}

export async function assignPortalRequest(input: {
  requestId: string;
  operator: OperatorSession;
  note?: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("portal_requests")
    .select("group_key, company_id")
    .eq("id", input.requestId)
    .single();

  if (!row) {
    throw new Error("Solicitação não encontrada.");
  }

  assertOperatorCanEdit(input.operator, {
    groupKey: row.group_key as string,
    companyId: row.company_id ? Number(row.company_id) : null,
  });

  await admin
    .from("operator_assignments")
    .update({ is_active: false })
    .eq("request_id", input.requestId)
    .eq("is_active", true);

  await admin.from("operator_assignments").insert({
    request_id: input.requestId,
    operator_user_id: input.operator.userId,
    assigned_by_user_id: input.operator.userId,
    operator_name: input.operator.fullName,
    note: input.note || null,
    is_active: true,
  });

  const { data, error } = await admin
    .from("portal_requests")
    .update({
      assigned_operator_user_id: input.operator.userId,
      assigned_operator_name: input.operator.fullName,
    })
    .eq("id", input.requestId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Não foi possível atribuir a solicitação.");
  }

  await appendEvent({
    requestId: input.requestId,
    actorType: "operator",
    actorId: input.operator.userId,
    actorLabel: input.operator.fullName,
    eventType: "assigned",
    payload: {
      note: input.note || null,
      assignedOperatorName: input.operator.fullName,
    },
  });

  return mapRequest(data as PortalRequestRow);
}
