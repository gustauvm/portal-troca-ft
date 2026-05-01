import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentPayrollWindow, getPayrollWindowForDate, isDateInsidePayroll } from "@/lib/utils/payroll";
import { getEmployeeById, getWorkplaceById } from "@/lib/directory/service";
import { runConflictCheck } from "@/lib/requests/nexti-functions";
import { type EmployeeSession } from "@/lib/auth/employee-session";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { LaunchStatus, WorkflowStatus } from "@/lib/types";

const swapSchema = z.object({
  requestType: z.literal("swap"),
  substituteEmployeeId: z.string().uuid(),
  workplaceId: z.string().uuid().optional().nullable(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(8).max(500),
});

const ftSchema = z.object({
  requestType: z.literal("ft"),
  workplaceId: z.string().uuid(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(8).max(500),
});

export const requestPayloadSchema = z.discriminatedUnion("requestType", [swapSchema, ftSchema]);

type PortalRequestRow = {
  id: string;
  request_type: "swap" | "ft";
  workflow_status: "submitted" | "approved" | "rejected" | "cancelled";
  launch_status: "waiting" | "matched" | "not_found" | "error";
  group_key: string;
  payroll_reference: string;
  payroll_period_start: string;
  payroll_period_end: string;
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
  assigned_operator_name: string | null;
};

function mapRequest(row: PortalRequestRow) {
  return {
    id: row.id,
    requestType: row.request_type,
    workflowStatus: row.workflow_status,
    launchStatus: row.launch_status,
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
    assignedOperatorName: row.assigned_operator_name,
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

export async function createPortalRequest(
  session: EmployeeSession,
  rawPayload: unknown,
) {
  const payload = requestPayloadSchema.parse(rawPayload);
  const requester = await getEmployeeById(session.employeeId);

  if (!requester || !requester.isActive) {
    throw new Error("Colaborador não localizado ou inativo.");
  }

  const currentPayroll = getCurrentPayrollWindow();
  const requestPayroll = getPayrollWindowForDate(payload.requestDate);

  if (requestPayroll.reference !== currentPayroll.reference) {
    throw new Error("A solicitação deve estar dentro da folha atual.");
  }

  if (!isDateInsidePayroll(payload.requestDate, currentPayroll)) {
    throw new Error("A data principal está fora da folha atual.");
  }

  if (payload.requestType === "swap" && !isDateInsidePayroll(payload.coverageDate, currentPayroll)) {
    throw new Error("A data de compensação está fora da folha atual.");
  }

  const workplace = payload.workplaceId ? await getWorkplaceById(payload.workplaceId) : null;
  if (payload.requestType === "ft" && !workplace) {
    throw new Error("Selecione uma unidade válida para o lançamento de FT.");
  }

  if (workplace && (workplace.groupKey !== requester.groupKey || workplace.companyId !== requester.companyId)) {
    throw new Error("A unidade escolhida não pertence ao mesmo grupo e empresa do colaborador.");
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

    if (substitute.careerId !== requester.careerId) {
      throw new Error("A permuta só pode ocorrer entre colaboradores do mesmo cargo.");
    }

    await ensureOpenDuplicateFree({
      requesterEmployeeId: requester.id,
      substituteEmployeeId: substitute.id,
      requestDate: payload.requestDate,
      coverageDate: payload.coverageDate,
      requestType: payload.requestType,
    });
  } else {
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
    reason: payload.reason,
  });

  if (!conflictCheck.ok) {
    throw new Error(conflictCheck.issues.join(" "));
  }

  const admin = createSupabaseAdminClient();
  const insertPayload: Database["public"]["Tables"]["portal_requests"]["Insert"] = {
    request_type: payload.requestType,
    workflow_status: "submitted",
    launch_status: "waiting",
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
    shift_id: requester.shiftId,
    shift_name: requester.shiftName,
    workplace_id: workplace?.nextiWorkplaceId || requester.workplaceId || null,
    workplace_external_id: workplace?.workplaceExternalId || requester.workplaceExternalId || null,
    workplace_name: workplace?.name || requester.workplaceName || null,
    request_date: payload.requestDate,
    coverage_date: payload.requestType === "swap" ? payload.coverageDate : null,
    reason: payload.reason.trim(),
    validation_summary: (conflictCheck.summary || {}) as Json,
    request_snapshot: {
      requester,
      substitute,
      workplace: workplace || null,
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

export async function listEmployeeRequests(session: EmployeeSession, payrollReference?: string) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("portal_requests")
    .select("*")
    .or(`requester_employee_id.eq.${session.employeeId},substitute_employee_id.eq.${session.employeeId}`)
    .order("created_at", { ascending: false });

  if (payrollReference) {
    query = query.eq("payroll_reference", payrollReference);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Não foi possível consultar as solicitações.");
  }

  return ((data || []) as PortalRequestRow[]).map(mapRequest);
}

export async function cancelPortalRequest(session: EmployeeSession, requestId: string) {
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

  if (row.workflow_status === "rejected" || row.launch_status === "matched") {
    throw new Error("Essa solicitação não pode mais ser cancelada.");
  }

  const { data, error } = await admin
    .from("portal_requests")
    .update({
      workflow_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_employee_id: session.employeeId,
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

export async function listOperatorRequests(filters: OperatorFilterInput) {
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

export async function getOperatorRequestDetail(requestId: string) {
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
  operatorUserId: string;
  operatorName: string;
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

  const nextState: Database["public"]["Tables"]["portal_requests"]["Update"] =
    input.decision === "approve"
      ? {
          workflow_status: "approved",
          approved_at: now,
          approved_by: input.operatorUserId,
        }
      : {
          workflow_status: "rejected",
          rejected_at: now,
          rejected_by: input.operatorUserId,
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
    actorId: input.operatorUserId,
    actorLabel: input.operatorName,
    eventType: input.decision === "approve" ? "approved" : "rejected",
    payload: {
      note: input.note || null,
    },
  });

  return mapRequest(data as PortalRequestRow);
}

export async function assignPortalRequest(input: {
  requestId: string;
  operatorUserId: string;
  operatorName: string;
  assignedByUserId: string;
  note?: string;
}) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("operator_assignments")
    .update({ is_active: false })
    .eq("request_id", input.requestId)
    .eq("is_active", true);

  await admin.from("operator_assignments").insert({
    request_id: input.requestId,
    operator_user_id: input.operatorUserId,
    assigned_by_user_id: input.assignedByUserId,
    operator_name: input.operatorName,
    note: input.note || null,
    is_active: true,
  });

  const { data, error } = await admin
    .from("portal_requests")
    .update({
      assigned_operator_user_id: input.operatorUserId,
      assigned_operator_name: input.operatorName,
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
    actorId: input.assignedByUserId,
    actorLabel: input.operatorName,
    eventType: "assigned",
    payload: {
      note: input.note || null,
      assignedOperatorName: input.operatorName,
    },
  });

  return mapRequest(data as PortalRequestRow);
}
