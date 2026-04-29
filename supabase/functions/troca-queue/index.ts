import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/http.ts";

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(String(value || "50"), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

function parseOffset(value: string | null) {
  const parsed = Number.parseInt(String(value || "0"), 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function parseStatusList(value: string | null) {
  return String(value || "pending")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
    const group = String(url.searchParams.get("group") || "").trim();
    const statuses = parseStatusList(url.searchParams.get("status"));
    const limit = parseLimit(url.searchParams.get("limit"));
    const offset = parseOffset(url.searchParams.get("offset"));

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
      .select(
        "id, request_type, status, group_key, payroll_reference, requester_name, requester_enrolment, substitute_name, substitute_enrolment, workplace_name, work_date, off_date, reason, created_at, approved_at, rejected_at, launched_at, nexti_match_status, nexti_match_error",
        { count: "exact" }
      )
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (group) {
      query = query.eq("group_key", group);
    }

    const { data, error, count } = await query;

    if (error) {
      return errorResponse("Falha ao consultar fila de solicitacoes.", 500, error.message);
    }

    return jsonResponse({
      items: data || [],
      pagination: {
        total: count ?? 0,
        limit,
        offset
      },
      filters: {
        group: group || null,
        statuses
      }
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "Falha ao consultar fila.", 500);
  }
});
