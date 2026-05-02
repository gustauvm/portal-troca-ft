import "server-only";

import { z } from "zod";
import { assertOperatorCanEdit, type OperatorSession } from "@/lib/auth/operator-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { formatBrazilianDate } from "@/lib/utils";
import { normalizeBrazilWhatsappPhone } from "@/lib/utils/phone";

type PortalRequestRow = Database["public"]["Tables"]["portal_requests"]["Row"];
type NextiHistoryRow = Database["public"]["Tables"]["nexti_launch_history"]["Row"];
type EmployeeRow = Pick<
  Database["public"]["Tables"]["employee_directory"]["Row"],
  "id" | "nexti_person_id" | "enrolment" | "full_name" | "phone" | "phone2" | "whatsapp_phone" | "is_active"
>;
type WhatsappRuleRow = Database["public"]["Tables"]["whatsapp_notification_rules"]["Row"];

const manualWhatsappSchema = z.object({
  targetType: z.enum(["portal_request", "nexti_history"]),
  targetId: z.string().uuid(),
});

function isRuleMatch(rule: WhatsappRuleRow, target: WhatsappTarget) {
  if (rule.request_type && rule.request_type !== target.requestType) return false;
  if (rule.scope_type === "global") return rule.scope_key === "*";
  if (rule.scope_type === "request_type") return rule.scope_key === target.requestType;
  if (rule.scope_type === "group") return rule.scope_key === target.groupKey;
  if (rule.scope_type === "company") return String(target.companyId || "") === rule.scope_key;
  if (rule.scope_type === "workplace") return String(target.workplaceId || "") === rule.scope_key;
  if (rule.scope_type === "employee") {
    return [target.employee.id, String(target.employee.nexti_person_id), target.employee.enrolment].includes(rule.scope_key);
  }
  return false;
}

function ruleWeight(rule: WhatsappRuleRow) {
  const weights = {
    global: 0,
    request_type: 1,
    group: 2,
    company: 3,
    workplace: 4,
    employee: 5,
  } as const;
  return weights[rule.scope_type];
}

type WhatsappTarget = {
  targetType: "portal_request" | "nexti_history";
  targetId: string;
  requestType: "swap" | "ft";
  groupKey: string;
  companyId: number | null;
  workplaceId: number | null;
  requesterName: string;
  requesterEnrolment: string | null;
  workplaceName: string | null;
  requestDate: string;
  coverageDate: string | null;
  employee: EmployeeRow;
};

async function loadEmployee(employeeId?: string | null, personId?: number | null) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("employee_directory")
    .select("id, nexti_person_id, enrolment, full_name, phone, phone2, whatsapp_phone, is_active")
    .limit(1);

  if (employeeId) {
    query = query.eq("id", employeeId);
  } else if (personId) {
    query = query.eq("nexti_person_id", personId);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Não foi possível consultar telefone do colaborador.");
  return data as EmployeeRow | null;
}

async function loadPortalTarget(targetId: string): Promise<WhatsappTarget | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("portal_requests")
    .select("*")
    .eq("id", targetId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível consultar solicitação.");
  if (!data) return null;
  const row = data as PortalRequestRow;
  if (row.launch_status !== "matched") {
    throw new Error("WhatsApp só fica disponível depois do lançamento confirmado.");
  }

  const employee = await loadEmployee(row.requester_employee_id, row.requester_nexti_person_id);
  if (!employee) throw new Error("Colaborador da solicitação não localizado.");
  return {
    targetType: "portal_request",
    targetId: row.id,
    requestType: row.request_type,
    groupKey: row.group_key,
    companyId: row.company_id,
    workplaceId: row.workplace_id,
    requesterName: row.requester_name,
    requesterEnrolment: row.requester_enrolment,
    workplaceName: row.workplace_name,
    requestDate: row.request_date,
    coverageDate: row.coverage_date,
    employee,
  };
}

async function loadNextiTarget(targetId: string): Promise<WhatsappTarget | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("nexti_launch_history")
    .select("*")
    .eq("id", targetId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível consultar histórico Nexti.");
  if (!data) return null;
  const row = data as NextiHistoryRow;
  const employee = await loadEmployee(row.requester_employee_id, row.requester_nexti_person_id);
  if (!employee) throw new Error("Colaborador do histórico não localizado.");
  return {
    targetType: "nexti_history",
    targetId: row.id,
    requestType: row.request_type,
    groupKey: row.group_key,
    companyId: row.company_id,
    workplaceId: row.workplace_id,
    requesterName: row.requester_name,
    requesterEnrolment: row.requester_enrolment,
    workplaceName: row.workplace_name,
    requestDate: row.request_date,
    coverageDate: row.coverage_date,
    employee,
  };
}

async function assertWhatsappRuleEnabled(target: WhatsappTarget) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("whatsapp_notification_rules").select("*");
  if (error) {
    throw new Error("Não foi possível validar regras de WhatsApp.");
  }

  const winner = ((data || []) as WhatsappRuleRow[])
    .filter((rule) => isRuleMatch(rule, target))
    .sort((left, right) => ruleWeight(right) - ruleWeight(left))[0];

  if (winner && !winner.enabled) {
    throw new Error("WhatsApp desativado por regra operacional para este caso.");
  }
}

function buildMessage(target: WhatsappTarget) {
  const typeLabel = target.requestType === "swap" ? "Permuta (Troca de Folga)" : "FT";
  const dateText = target.coverageDate
    ? `${formatBrazilianDate(target.requestDate)} e ${formatBrazilianDate(target.coverageDate)}`
    : formatBrazilianDate(target.requestDate);

  return [
    `Olá, ${target.requesterName}.`,
    `Seu lançamento de ${typeLabel} foi confirmado.`,
    `Data: ${dateText}.`,
    target.workplaceName ? `Unidade: ${target.workplaceName}.` : null,
    "Se houver divergência, procure a operação.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createManualWhatsappLink(operator: OperatorSession, rawPayload: unknown) {
  const payload = manualWhatsappSchema.parse(rawPayload);
  const target =
    payload.targetType === "portal_request"
      ? await loadPortalTarget(payload.targetId)
      : await loadNextiTarget(payload.targetId);

  if (!target) {
    throw new Error("Registro não encontrado.");
  }

  assertOperatorCanEdit(operator, {
    groupKey: target.groupKey,
    companyId: target.companyId,
  });

  if (!target.employee.is_active) {
    throw new Error("Colaborador inativo. WhatsApp bloqueado.");
  }

  await assertWhatsappRuleEnabled(target);
  const phone = target.employee.whatsapp_phone || normalizeBrazilWhatsappPhone(target.employee.phone, target.employee.phone2);
  if (!phone) {
    throw new Error("Colaborador sem telefone válido para WhatsApp no cadastro Nexti.");
  }

  const message = buildMessage(target);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const supabase = createSupabaseAdminClient();
  await supabase.from("whatsapp_send_events").insert({
    event_type: "whatsapp_manual_opened",
    target_type: payload.targetType,
    target_id: payload.targetId,
    operator_user_id: operator.userId,
    operator_email: operator.email,
    operator_name: operator.fullName,
    employee_nexti_person_id: target.employee.nexti_person_id,
    employee_name: target.requesterName,
    employee_enrolment: target.requesterEnrolment,
    phone_raw: target.employee.phone || target.employee.phone2 || null,
    phone_normalized: phone,
    message,
    wa_url: url,
  });

  return {
    ok: true,
    url,
    phone,
    message,
  } satisfies Json;
}
