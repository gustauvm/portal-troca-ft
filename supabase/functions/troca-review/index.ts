import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, readJsonBody } from "../_shared/http.ts";
import { buildNextiDraftSafe, type TrocaRequestPayload } from "../_shared/troca-nexti.ts";

type ReviewRequest = {
  requestId?: string;
  decision?: "approve" | "reject";
  reviewedBy?: string;
  note?: string;
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

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
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

function normalizeReviewedBy(value: string | undefined) {
  return String(value || "").trim() || null;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const input = await readJsonBody<ReviewRequest>(request);
    if (!input.requestId) return errorResponse("Campo requestId e obrigatorio.", 400);
    if (!input.decision || !["approve", "reject"].includes(input.decision)) {
      return errorResponse("Campo decision invalido.", 400);
    }

    const reviewedBy = normalizeReviewedBy(input.reviewedBy);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false
        }
      }
    );

    const { data: row, error: fetchError } = await supabase
      .from("troca_requests")
      .select("id, status, group_key, reason, work_date, off_date, requester_payload, substitute_payload, workplace_payload")
      .eq("id", input.requestId)
      .single();

    if (fetchError || !row) {
      return errorResponse("Solicitacao nao encontrada.", 404, fetchError?.message);
    }

    const requestRow = row as StoredRequestRow;

    if (requestRow.status === "launched") {
      return errorResponse("Solicitacao ja marcada como lancada.", 409);
    }

    if (input.decision === "reject") {
      if (requestRow.status === "rejected") {
        return errorResponse("Solicitacao ja rejeitada.", 409);
      }

      const { data: rejected, error: rejectError } = await supabase
        .from("troca_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejected_by: reviewedBy,
          decision_note: input.note || null,
          nexti_match_source: "none",
          nexti_match_status: "not_applicable"
        })
        .eq("id", requestRow.id)
        .select("id, status, rejected_at, rejected_by, decision_note")
        .single();

      if (rejectError) {
        return errorResponse("Falha ao rejeitar solicitacao.", 500, rejectError.message);
      }

      return jsonResponse({
        requestId: rejected.id,
        status: rejected.status,
        rejectedAt: rejected.rejected_at,
        rejectedBy: rejected.rejected_by,
        note: rejected.decision_note
      });
    }

    if (requestRow.status === "rejected" || requestRow.status === "cancelled") {
      return errorResponse("Solicitacao nao pode ser aprovada no estado atual.", 409);
    }

    const requestPayload = toPayload(requestRow);
    const nextiDraft = buildNextiDraftSafe(requestPayload);

    const { data: approved, error: approveError } = await supabase
      .from("troca_requests")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: reviewedBy,
        decision_note: input.note || null,
        nexti_draft: nextiDraft.draft,
        nexti_match_source: "none",
        nexti_match_status: "not_checked",
        nexti_match_error: nextiDraft.ready ? null : nextiDraft.errors.join(" | ")
      })
      .eq("id", requestRow.id)
      .select("id, status, approved_at, approved_by, decision_note, nexti_match_status, nexti_match_error")
      .single();

    if (approveError) {
      return errorResponse("Falha ao aprovar solicitacao.", 500, approveError.message);
    }

    return jsonResponse({
      requestId: approved.id,
      status: approved.status,
      approvedAt: approved.approved_at,
      approvedBy: approved.approved_by,
      note: approved.decision_note,
      nextiMatchStatus: approved.nexti_match_status,
      nextiMatchError: approved.nexti_match_error,
      nextiPreview: nextiDraft.draft
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "Falha ao revisar solicitacao.", 500);
  }
});
