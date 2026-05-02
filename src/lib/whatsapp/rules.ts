import "server-only";

import { z } from "zod";
import { assertOperatorIsAdmin, type OperatorSession } from "@/lib/auth/operator-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const whatsappRuleSchema = z.object({
  scopeType: z.enum(["global", "group", "company", "workplace", "employee", "request_type"]),
  scopeKey: z.string().trim().min(1),
  requestType: z.enum(["swap", "ft"]).nullable().optional(),
  enabled: z.boolean(),
  note: z.string().trim().max(400).optional(),
});

export async function listWhatsappRules(operator: OperatorSession) {
  assertOperatorIsAdmin(operator);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_notification_rules")
    .select("*")
    .order("scope_type")
    .order("scope_key");

  if (error) throw new Error("Não foi possível listar regras de WhatsApp.");
  return (data || []).map((rule) => ({
    id: rule.id,
    scopeType: rule.scope_type,
    scopeKey: rule.scope_key,
    requestType: rule.request_type,
    enabled: rule.enabled,
    note: rule.note,
  }));
}

export async function upsertWhatsappRule(operator: OperatorSession, rawPayload: unknown) {
  assertOperatorIsAdmin(operator);
  const payload = whatsappRuleSchema.parse(rawPayload);
  const supabase = createSupabaseAdminClient();
  let existingQuery = supabase
    .from("whatsapp_notification_rules")
    .select("id")
    .eq("scope_type", payload.scopeType)
    .eq("scope_key", payload.scopeKey);

  existingQuery = payload.requestType ? existingQuery.eq("request_type", payload.requestType) : existingQuery.is("request_type", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const row = {
    scope_type: payload.scopeType,
    scope_key: payload.scopeKey,
    request_type: payload.requestType || null,
    enabled: payload.enabled,
    note: payload.note || null,
    updated_by: operator.userId,
    created_by: operator.userId,
  };

  const mutation = existing?.id
    ? supabase.from("whatsapp_notification_rules").update(row).eq("id", existing.id)
    : supabase.from("whatsapp_notification_rules").insert(row);

  const { data, error } = await mutation
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "Não foi possível salvar regra de WhatsApp.");
  return {
    id: data.id,
    scopeType: data.scope_type,
    scopeKey: data.scope_key,
    requestType: data.request_type,
    enabled: data.enabled,
    note: data.note,
  };
}

export async function deleteWhatsappRule(operator: OperatorSession, id: string) {
  assertOperatorIsAdmin(operator);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("whatsapp_notification_rules").delete().eq("id", id);
  if (error) throw new Error("Não foi possível remover regra de WhatsApp.");
  return { ok: true };
}
