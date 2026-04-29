import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, readJsonBody } from "../_shared/http.ts";
import { requireGroupConfig } from "../_shared/group-config.ts";
import { buildNextiDraftSafe, type TrocaRequestPayload } from "../_shared/troca-nexti.ts";
import { getPayrollWindowForDate } from "../_shared/payroll.ts";

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function isIsoDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function buildWhatsappMessage(payload: TrocaRequestPayload) {
  return `*COMPROVANTE - SOLICITACAO DE TROCA*\n\n` +
    `👤 *Solicitante:* ${payload.requester?.name} (RE: ${payload.requester?.enrolment})\n` +
    `🗓️ *Data da Folga:* ${payload.workDate?.split("-").reverse().join("/")}\n` +
    `🏢 *Unidade:* ${payload.workplace?.name}\n\n` +
    `🤝 *Substituto:* ${payload.substitute?.name} (RE: ${payload.substitute?.enrolment})\n` +
    `🔁 *Data Pagamento:* ${payload.offDate?.split("-").reverse().join("/")}\n\n` +
    `💬 *Motivo:* ${payload.reason}`;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const payload = await readJsonBody<TrocaRequestPayload>(request);
    if (!payload.group) return errorResponse("Campo group e obrigatorio.", 400);
    if (!payload.requester?.name || !payload.requester?.enrolment) return errorResponse("Solicitante invalido.", 400);
    if (!payload.substitute?.name || !payload.substitute?.enrolment) return errorResponse("Substituto invalido.", 400);
    if (!payload.workplace?.name) return errorResponse("Posto/unidade invalido.", 400);
    if (!isIsoDate(payload.workDate) || !isIsoDate(payload.offDate)) return errorResponse("Datas invalidas. Use YYYY-MM-DD.", 400);
    if (!payload.reason || payload.reason.trim().length < 5) return errorResponse("Motivo invalido.", 400);

    const groupConfig = requireGroupConfig(payload.group);
    const whatsappMessage = buildWhatsappMessage(payload);
    const nextiDraft = buildNextiDraftSafe(payload);
    const payrollWindow = getPayrollWindowForDate(payload.workDate);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false
        }
      }
    );

    const insertPayload = {
      group_key: payload.group,
      request_type: payload.requestType || "day_off_swap",
      status: "pending",
      origin: "portal-nexti",
      payroll_reference: payrollWindow.reference,
      payroll_period_start: payrollWindow.periodStart,
      payroll_period_end: payrollWindow.periodEnd,
      requester_enrolment: payload.requester.enrolment,
      requester_name: payload.requester.name,
      requester_person_id: payload.requester.id ?? null,
      requester_external_id: payload.requester.externalId ?? null,
      requester_rotation_code: payload.requester.rotationCode ?? null,
      substitute_enrolment: payload.substitute.enrolment,
      substitute_name: payload.substitute.name,
      substitute_person_id: payload.substitute.id ?? null,
      substitute_external_id: payload.substitute.externalId ?? null,
      substitute_rotation_code: payload.substitute.rotationCode ?? null,
      workplace_name: payload.workplace.name,
      workplace_id: payload.workplace.id ?? null,
      workplace_external_id: payload.workplace.externalId ?? null,
      work_date: payload.workDate,
      off_date: payload.offDate,
      reason: payload.reason.trim(),
      whatsapp_target_phone: groupConfig.whatsappNumber,
      whatsapp_message: whatsappMessage,
      requester_payload: payload.requester,
      substitute_payload: payload.substitute,
      workplace_payload: payload.workplace,
      nexti_draft: nextiDraft.draft,
      nexti_match_payload: {},
      nexti_match_source: "none",
      nexti_match_status: "not_checked",
      request_payload: payload
    };

    const { data, error } = await supabase
      .from("troca_requests")
      .insert(insertPayload)
      .select("id, status, created_at")
      .single();

    if (error) {
      console.error(error);
      return errorResponse("Nao foi possivel registrar a solicitacao no Supabase.", 500, error.message);
    }

    return jsonResponse({
      requestId: data.id,
      status: data.status,
      createdAt: data.created_at,
      payrollReference: payrollWindow.reference,
      payrollPeriodStart: payrollWindow.periodStart,
      payrollPeriodEnd: payrollWindow.periodEnd,
      nextiDraftReady: nextiDraft.ready,
      nextiDraftErrors: nextiDraft.errors,
      whatsappTargetPhone: groupConfig.whatsappNumber,
      whatsappMessage
    }, 201);
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "Falha ao registrar a solicitacao.", 500);
  }
});
