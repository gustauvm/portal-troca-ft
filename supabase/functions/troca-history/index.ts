import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/http.ts";
import { getCurrentPayrollWindow, getPayrollWindowFromReference } from "../_shared/payroll.ts";

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(String(value || "50"), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(request.url);
    const enrolment = String(url.searchParams.get("enrolment") || "").trim();
    if (!enrolment) {
      return errorResponse("Parametro enrolment e obrigatorio.", 400);
    }

    const group = String(url.searchParams.get("group") || "").trim();
    const limit = normalizeLimit(url.searchParams.get("limit"));
    const currentPayroll = url.searchParams.get("currentPayroll") !== "false";
    const payrollReference = String(url.searchParams.get("payrollReference") || "").trim();

    const window = payrollReference
      ? getPayrollWindowFromReference(payrollReference)
      : getCurrentPayrollWindow();

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false
        }
      }
    );

    let query = supabase
      .from("troca_requests")
      .select("id, request_type, status, group_key, payroll_reference, requester_name, requester_enrolment, substitute_name, substitute_enrolment, workplace_name, work_date, off_date, reason, created_at, approved_at, rejected_at, launched_at, nexti_match_status")
      .or(`requester_enrolment.eq.${enrolment},substitute_enrolment.eq.${enrolment}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (group) {
      query = query.eq("group_key", group);
    }

    if (currentPayroll || payrollReference) {
      query = query.eq("payroll_reference", window.reference);
    }

    const { data, error } = await query;
    if (error) {
      return errorResponse("Falha ao consultar historico do colaborador.", 500, error.message);
    }

    const items = (data || []).map((item) => ({
      ...item,
      role:
        item.requester_enrolment === enrolment
          ? "requester"
          : item.substitute_enrolment === enrolment
            ? "substitute"
            : "participant"
    }));

    return jsonResponse({
      enrolment,
      payrollWindow: window,
      items
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "Falha ao consultar historico.", 500);
  }
});
