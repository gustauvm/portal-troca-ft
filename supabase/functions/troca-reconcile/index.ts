import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, readJsonBody } from "../_shared/http.ts";
import { fetchAllPages, fetchNextiToken } from "../_shared/nexti.ts";
import { buildNextiDraftSafe, buildScheduleTransferPreview, type TrocaRequestPayload, type ScheduleTransferPayload } from "../_shared/troca-nexti.ts";

type ReconcileRequest = {
  requestId?: string;
  group?: string;
  source?: "schedule_transfer" | "replacement" | "none";
  limit?: number;
};

type StoredRequestRow = {
  id: string;
  status: string;
  group_key: string;
  reason: string;
  work_date: string;
  off_date: string;
  requester_payload: TrocaRequestPayload["requester"];
  substitute_payload: TrocaRequestPayload["substitute"];
  workplace_payload: TrocaRequestPayload["workplace"];
};

type NextiScheduleTransfer = {
  id?: number;
  personId?: number;
  personExternalId?: string;
  scheduleId?: number;
  scheduleExternalId?: string;
  rotationId?: number;
  rotationCode?: number;
  transferDateTime?: string;
  observation?: string;
  removed?: boolean;
};

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getSource(input?: string | null) {
  const value = String(input || Deno.env.get("NEXTI_RECONCILIATION_SOURCE") || "schedule_transfer")
    .trim()
    .toLowerCase();

  if (value === "none") return "none";
  if (value === "replacement") return "replacement";
  return "schedule_transfer";
}

function normalizeLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "50"), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

function toPayload(row: StoredRequestRow): TrocaRequestPayload {
  return {
    group: row.group_key,
    requester: row.requester_payload || {},
    substitute: row.substitute_payload || {},
    workplace: row.workplace_payload || {},
    workDate: row.work_date,
    offDate: row.off_date,
    reason: row.reason
  };
}

function nextiDayRange(reference: string) {
  const prefix = String(reference || "").slice(0, 8);
  return {
    start: `${prefix}000000`,
    finish: `${prefix}235959`
  };
}

async function hasMatchingScheduleTransfer(token: string, transfer: ScheduleTransferPayload) {
  const range = nextiDayRange(transfer.transferDateTime);
  const path = `/scheduletransfers/personexternal/${encodeURIComponent(transfer.personExternalId)}/start/${range.start}/finish/${range.finish}`;
  const candidates = await fetchAllPages<NextiScheduleTransfer>(path, token, {}, 100);

  return candidates.some((candidate) => {
    if (candidate.removed) return false;
    const sameDay = String(candidate.transferDateTime || "").slice(0, 8) === String(transfer.transferDateTime || "").slice(0, 8);
    const sameRotation = Number(candidate.rotationCode) === Number(transfer.rotationCode);
    const sameSchedule =
      (candidate.scheduleExternalId && candidate.scheduleExternalId === transfer.scheduleExternalId) ||
      (typeof candidate.scheduleId === "number" && candidate.scheduleId === transfer.scheduleId);

    return sameDay && sameRotation && sameSchedule;
  });
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const input = await readJsonBody<ReconcileRequest>(request);
    const source = getSource(input.source);
    const limit = normalizeLimit(input.limit);

    if (source === "none") {
      return jsonResponse({
        source,
        processed: 0,
        matched: 0,
        notFound: 0,
        errors: 0,
        items: []
      });
    }

    if (source !== "schedule_transfer") {
      return errorResponse("Fonte de reconciliacao ainda nao implementada para este ambiente.", 400, { source });
    }

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
      .select("id, status, group_key, reason, work_date, off_date, requester_payload, substitute_payload, workplace_payload")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (input.requestId) {
      query = query.eq("id", input.requestId);
    }

    if (input.group) {
      query = query.eq("group_key", input.group);
    }

    const { data: rows, error: queryError } = await query;
    if (queryError) {
      return errorResponse("Falha ao consultar solicitacoes para reconciliacao.", 500, queryError.message);
    }

    const requests = (rows || []) as StoredRequestRow[];
    if (!requests.length) {
      return jsonResponse({
        source,
        processed: 0,
        matched: 0,
        notFound: 0,
        errors: 0,
        items: []
      });
    }

    const token = await fetchNextiToken();
    const items = [];
    let matched = 0;
    let notFound = 0;
    let errors = 0;

    for (const row of requests) {
      const payload = toPayload(row);
      const draft = buildNextiDraftSafe(payload);

      if (!draft.ready) {
        errors += 1;
        const message = draft.errors.join(" | ");

        await supabase
          .from("troca_requests")
          .update({
            nexti_match_source: source,
            nexti_match_status: "error",
            nexti_match_error: message,
            nexti_last_checked_at: new Date().toISOString(),
            nexti_match_payload: draft.draft
          })
          .eq("id", row.id);

        items.push({
          requestId: row.id,
          status: "error",
          message
        });
        continue;
      }

      const preview = buildScheduleTransferPreview(payload);
      const checks = [];
      let allMatched = true;

      for (const transfer of preview) {
        const found = await hasMatchingScheduleTransfer(token, transfer);
        checks.push({
          transfer,
          found
        });
        if (!found) allMatched = false;
      }

      const nextStatus = allMatched ? "matched" : "not_found";
      const requestStatus = allMatched ? "launched" : "approved";
      const nowIso = new Date().toISOString();

      await supabase
        .from("troca_requests")
        .update({
          status: requestStatus,
          launched_at: allMatched ? nowIso : null,
          nexti_match_source: source,
          nexti_match_status: nextStatus,
          nexti_match_error: null,
          nexti_last_checked_at: nowIso,
          nexti_match_payload: {
            source,
            checkedAt: nowIso,
            checks
          }
        })
        .eq("id", row.id);

      if (allMatched) matched += 1;
      else notFound += 1;

      items.push({
        requestId: row.id,
        status: nextStatus,
        launched: allMatched,
        checks
      });
    }

    return jsonResponse({
      source,
      processed: requests.length,
      matched,
      notFound,
      errors,
      items
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "Falha ao reconciliar solicitacoes.", 500);
  }
});
