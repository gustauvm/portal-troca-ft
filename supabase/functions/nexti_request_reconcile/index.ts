import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, readJsonBody } from "../_shared/http.ts";
import { fetchAllPages, fetchNextiToken } from "../_shared/nexti.ts";
import { appendRequestEvent, createServiceClient } from "../_shared/portal-db.ts";
import {
  buildSwapTransferPreview,
  formatNextiDate,
  getNextiDayRange,
  isSameNextiDay,
  type PortalSnapshotPerson,
  type PortalSnapshotWorkplace,
  type SwapTransferPreview,
} from "../_shared/portal-nexti.ts";

type ReconcileRequest = {
  requestId?: string;
  group?: string | null;
  limit?: number;
  start?: string | null;
  finish?: string | null;
};

type PortalRequestRow = {
  id: string;
  request_type: "swap" | "ft";
  workflow_status: "submitted" | "approved" | "rejected" | "cancelled";
  launch_status: "waiting" | "matched" | "not_found" | "error";
  group_key: string;
  request_date: string;
  coverage_date: string | null;
  reason: string;
  requester_name: string;
  requester_person_external_id: string;
  requester_nexti_person_id: number;
  requester_enrolment: string;
  substitute_name: string | null;
  substitute_person_external_id: string | null;
  substitute_nexti_person_id: number | null;
  workplace_external_id: string | null;
  workplace_name: string | null;
  request_snapshot: {
    requester?: PortalSnapshotPerson & { companyNumber?: string | null };
    substitute?: PortalSnapshotPerson & { companyNumber?: string | null };
    workplace?: PortalSnapshotWorkplace | null;
    form?: Record<string, unknown>;
  } | null;
  nexti_match_payload: Record<string, unknown> | null;
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
  lastUpdate?: string;
  removed?: boolean;
};

type NextiReplacement = {
  id?: number;
  personId?: number;
  personExternalId?: string;
  absenteeId?: number;
  absenteeExternalId?: string;
  workplaceId?: number;
  workplaceExternalId?: string;
  startDateTime?: string;
  finishDateTime?: string;
  replacementTypeId?: number;
  note?: string;
  shiftId?: number;
  shiftExternalId?: string;
  lastUpdate?: string;
  removed?: boolean;
};

function normalizeLimit(value: unknown) {
  const parsed = Number.parseInt(String(value || "100"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }
  return Math.min(parsed, 300);
}

function buildStateKey(source: "schedule_transfer" | "replacement") {
  return `reconcile:${source}`;
}

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function buildIndexKey(personExternalId: string, isoDate: string) {
  return `${normalizeText(personExternalId)}|${isoDate}`;
}

function pushToIndex<T extends { personExternalId?: string; transferDateTime?: string; startDateTime?: string }>(
  index: Map<string, T[]>,
  personExternalId: string | undefined,
  isoDate: string | null,
  item: T,
) {
  if (!personExternalId || !isoDate) {
    return;
  }

  const key = buildIndexKey(personExternalId, isoDate);
  const current = index.get(key) || [];
  current.push(item);
  index.set(key, current);
}

async function readSyncState(syncKey: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("nexti_sync_state")
    .select("*")
    .eq("sync_key", syncKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao consultar o cursor de sincronizacao: ${error.message}`);
  }

  return data as {
    sync_key: string;
    last_cursor_start: string | null;
    last_cursor_finish: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
}

async function writeSyncState(input: {
  syncKey: string;
  start: string;
  finish: string;
  metadata: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("nexti_sync_state").upsert(
    {
      sync_key: input.syncKey,
      last_cursor_start: input.start,
      last_cursor_finish: input.finish,
      last_success_at: input.errorMessage ? null : new Date().toISOString(),
      last_error: input.errorMessage || null,
      metadata: input.metadata,
    },
    {
      onConflict: "sync_key",
      ignoreDuplicates: false,
    },
  );

  if (error) {
    throw new Error(`Falha ao atualizar o cursor ${input.syncKey}: ${error.message}`);
  }
}

async function fetchScheduleTransfersByUpdateWindow(token: string, start: string, finish: string) {
  return fetchAllPages<NextiScheduleTransfer>(
    `/scheduletransfers/lastupdate/start/${encodeURIComponent(start)}/finish/${encodeURIComponent(finish)}`,
    token,
    {},
    250,
  );
}

async function fetchReplacementsByUpdateWindow(token: string, start: string, finish: string) {
  return fetchAllPages<NextiReplacement>(
    `/replacements/lastupdate/start/${encodeURIComponent(start)}/finish/${encodeURIComponent(finish)}`,
    token,
    {},
    250,
  );
}

async function fetchExactScheduleTransfers(token: string, transfer: SwapTransferPreview) {
  const isoDate = `${transfer.transferDateTime.slice(4, 8)}-${transfer.transferDateTime.slice(2, 4)}-${transfer.transferDateTime.slice(0, 2)}`;
  const dayRange = getNextiDayRange(isoDate);
  return fetchAllPages<NextiScheduleTransfer>(
    `/scheduletransfers/personexternal/${encodeURIComponent(transfer.personExternalId)}/start/${dayRange.start}/finish/${dayRange.finish}`,
    token,
    {},
    100,
  );
}

async function fetchExactReplacements(token: string, request: PortalRequestRow) {
  const companyNumber = String(request.request_snapshot?.requester?.companyNumber || "").trim();
  if (!companyNumber) {
    return [] as NextiReplacement[];
  }

  const dayRange = getNextiDayRange(request.request_date);
  return fetchAllPages<NextiReplacement>(
    `/replacements/companynumber/${encodeURIComponent(companyNumber)}/start/${dayRange.start}/finish/${dayRange.finish}/externalId/${encodeURIComponent(request.requester_person_external_id)}`,
    token,
    {},
    100,
  );
}

function matchScheduleTransfer(candidates: NextiScheduleTransfer[], expected: SwapTransferPreview) {
  return candidates.find((candidate) => {
    if (candidate.removed) return false;
    if (!isSameNextiDay(`${expected.transferDateTime.slice(4, 8)}-${expected.transferDateTime.slice(2, 4)}-${expected.transferDateTime.slice(0, 2)}`, candidate.transferDateTime)) {
      return false;
    }

    const sameRotation = Number(candidate.rotationCode) === Number(expected.rotationCode);
    const sameSchedule =
      (candidate.scheduleExternalId && candidate.scheduleExternalId === expected.scheduleExternalId) ||
      (typeof candidate.scheduleId === "number" && candidate.scheduleId === expected.scheduleId);

    return sameRotation && sameSchedule;
  });
}

function matchReplacement(request: PortalRequestRow, candidates: NextiReplacement[]) {
  const workplaceExternalId = normalizeText(request.workplace_external_id);
  return candidates.find((candidate) => {
    if (candidate.removed) return false;
    if (!isSameNextiDay(request.request_date, candidate.startDateTime)) return false;
    if (!candidate.personExternalId || normalizeText(candidate.personExternalId) !== normalizeText(request.requester_person_external_id)) {
      return false;
    }

    if (workplaceExternalId) {
      return normalizeText(candidate.workplaceExternalId) === workplaceExternalId;
    }

    return [1, 2, 3, 5].includes(Number(candidate.replacementTypeId || 0));
  });
}

async function updateRequestMatch(input: {
  request: PortalRequestRow;
  nextStatus: "matched" | "not_found" | "error";
  launchError?: string | null;
  matchPayload: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const patch = {
    launch_status: input.nextStatus,
    launch_error: input.launchError || null,
    launched_at: input.nextStatus === "matched" ? nowIso : null,
    nexti_match_payload: input.matchPayload,
  };

  const { error } = await supabase
    .from("portal_requests")
    .update(patch)
    .eq("id", input.request.id);

  if (error) {
    throw new Error(`Falha ao atualizar a solicitacao ${input.request.id}: ${error.message}`);
  }

  const previousStatus = input.request.launch_status;
  if (input.nextStatus === "matched" && previousStatus !== "matched") {
    await appendRequestEvent({
      requestId: input.request.id,
      actorType: "system",
      actorLabel: "Nexti reconcile",
      eventType: "launch_matched",
      payload: input.matchPayload,
    });
  }

  if (input.nextStatus === "not_found" && previousStatus !== "not_found") {
    await appendRequestEvent({
      requestId: input.request.id,
      actorType: "system",
      actorLabel: "Nexti reconcile",
      eventType: "launch_not_found",
      payload: input.matchPayload,
    });
  }

  if (input.nextStatus === "error" && (previousStatus !== "error" || input.launchError)) {
    await appendRequestEvent({
      requestId: input.request.id,
      actorType: "system",
      actorLabel: "Nexti reconcile",
      eventType: "launch_error",
      payload: {
        ...input.matchPayload,
        error: input.launchError || null,
      },
    });
  }
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
    const limit = normalizeLimit(input.limit);
    const supabase = createServiceClient();

    let query = supabase
      .from("portal_requests")
      .select("*")
      .eq("workflow_status", "approved")
      .in("launch_status", ["waiting", "not_found", "error"])
      .order("approved_at", { ascending: false })
      .limit(limit);

    if (input.requestId) {
      query = query.eq("id", input.requestId);
    }

    if (input.group) {
      query = query.eq("group_key", input.group);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Falha ao consultar solicitacoes pendentes de reconciliacao: ${error.message}`);
    }

    const requests = (data || []) as PortalRequestRow[];
    if (requests.length === 0) {
      return jsonResponse({
        ok: true,
        processed: 0,
        matched: 0,
        notFound: 0,
        errors: 0,
        items: [],
      });
    }

    const token = await fetchNextiToken();
    const now = new Date();
    const nowIso = now.toISOString();
    const defaultStartIso = subtractDays(now, 45).toISOString();
    const sourcesNeeded = {
      schedule_transfer: requests.some((requestRow) => requestRow.request_type === "swap"),
      replacement: requests.some((requestRow) => requestRow.request_type === "ft"),
    } as const;

    const windows = await Promise.all([
      sourcesNeeded.schedule_transfer ? readSyncState(buildStateKey("schedule_transfer")) : Promise.resolve(null),
      sourcesNeeded.replacement ? readSyncState(buildStateKey("replacement")) : Promise.resolve(null),
    ]);

    const scheduleWindowStart = input.start || windows[0]?.last_cursor_finish || subtractMinutes(new Date(defaultStartIso), 5).toISOString();
    const replacementWindowStart = input.start || windows[1]?.last_cursor_finish || subtractMinutes(new Date(defaultStartIso), 5).toISOString();
    const windowFinish = input.finish || nowIso;

    const [scheduleTransfers, replacements] = await Promise.all([
      sourcesNeeded.schedule_transfer
        ? fetchScheduleTransfersByUpdateWindow(token, scheduleWindowStart, windowFinish)
        : Promise.resolve([] as NextiScheduleTransfer[]),
      sourcesNeeded.replacement
        ? fetchReplacementsByUpdateWindow(token, replacementWindowStart, windowFinish)
        : Promise.resolve([] as NextiReplacement[]),
    ]);

    const scheduleIndex = new Map<string, NextiScheduleTransfer[]>();
    scheduleTransfers.forEach((item) => {
      pushToIndex(scheduleIndex, item.personExternalId, item.transferDateTime ? `${item.transferDateTime.slice(4, 8)}-${item.transferDateTime.slice(2, 4)}-${item.transferDateTime.slice(0, 2)}` : null, item);
    });

    const replacementIndex = new Map<string, NextiReplacement[]>();
    replacements.forEach((item) => {
      pushToIndex(replacementIndex, item.personExternalId, item.startDateTime ? `${item.startDateTime.slice(4, 8)}-${item.startDateTime.slice(2, 4)}-${item.startDateTime.slice(0, 2)}` : null, item);
    });

    const items = [];
    let matched = 0;
    let notFound = 0;
    let errors = 0;

    for (const requestRow of requests) {
      try {
        if (requestRow.request_type === "swap") {
          const preview = buildSwapTransferPreview({
            requester: requestRow.request_snapshot?.requester || {},
            substitute: requestRow.request_snapshot?.substitute || {},
            requestDate: requestRow.request_date,
            coverageDate: String(requestRow.coverage_date || ""),
            reason: requestRow.reason,
          });

          let foundTransfers = preview.map((expected) => {
            const key = buildIndexKey(
              expected.personExternalId,
              `${expected.transferDateTime.slice(4, 8)}-${expected.transferDateTime.slice(2, 4)}-${expected.transferDateTime.slice(0, 2)}`,
            );
            return matchScheduleTransfer(scheduleIndex.get(key) || [], expected) || null;
          });

          if (foundTransfers.some((item) => item === null)) {
            foundTransfers = await Promise.all(
              preview.map(async (expected) => {
                const exactCandidates = await fetchExactScheduleTransfers(token, expected);
                return matchScheduleTransfer(exactCandidates, expected) || null;
              }),
            );
          }

          const allMatched = foundTransfers.every((item) => item !== null);
          const matchPayload = {
            source: "schedule_transfer",
            checkedAt: nowIso,
            window: {
              start: scheduleWindowStart,
              finish: windowFinish,
            },
            expected: preview,
            foundTransfers,
          };

          await updateRequestMatch({
            request: requestRow,
            nextStatus: allMatched ? "matched" : "not_found",
            matchPayload,
          });

          if (allMatched) {
            matched += 1;
          } else {
            notFound += 1;
          }

          items.push({
            requestId: requestRow.id,
            requestType: requestRow.request_type,
            launchStatus: allMatched ? "matched" : "not_found",
            source: "schedule_transfer",
          });
          continue;
        }

        let replacementCandidates =
          replacementIndex.get(buildIndexKey(requestRow.requester_person_external_id, requestRow.request_date)) || [];

        if (replacementCandidates.length === 0) {
          replacementCandidates = await fetchExactReplacements(token, requestRow);
        }

        const replacement = matchReplacement(requestRow, replacementCandidates);
        const matchPayload = {
          source: "replacement",
          checkedAt: nowIso,
          window: {
            start: replacementWindowStart,
            finish: windowFinish,
          },
          candidateCount: replacementCandidates.length,
          replacement: replacement || null,
        };

        await updateRequestMatch({
          request: requestRow,
          nextStatus: replacement ? "matched" : "not_found",
          matchPayload,
        });

        if (replacement) {
          matched += 1;
        } else {
          notFound += 1;
        }

        items.push({
          requestId: requestRow.id,
          requestType: requestRow.request_type,
          launchStatus: replacement ? "matched" : "not_found",
          source: "replacement",
        });
      } catch (requestError) {
        errors += 1;
        const message = requestError instanceof Error ? requestError.message : "Falha na reconciliacao da solicitacao.";
        const matchPayload = {
          checkedAt: nowIso,
          error: message,
        };

        await updateRequestMatch({
          request: requestRow,
          nextStatus: "error",
          launchError: message,
          matchPayload,
        });

        items.push({
          requestId: requestRow.id,
          requestType: requestRow.request_type,
          launchStatus: "error",
          error: message,
        });
      }
    }

    if (sourcesNeeded.schedule_transfer) {
      await writeSyncState({
        syncKey: buildStateKey("schedule_transfer"),
        start: scheduleWindowStart,
        finish: windowFinish,
        metadata: {
          fetched: scheduleTransfers.length,
          processedRequests: requests.filter((requestRow) => requestRow.request_type === "swap").length,
          checkedAt: nowIso,
        },
      });
    }

    if (sourcesNeeded.replacement) {
      await writeSyncState({
        syncKey: buildStateKey("replacement"),
        start: replacementWindowStart,
        finish: windowFinish,
        metadata: {
          fetched: replacements.length,
          processedRequests: requests.filter((requestRow) => requestRow.request_type === "ft").length,
          checkedAt: nowIso,
        },
      });
    }

    return jsonResponse({
      ok: true,
      processed: requests.length,
      matched,
      notFound,
      errors,
      items,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(
      error instanceof Error ? error.message : "Falha ao reconciliar solicitacoes com a Nexti.",
      500,
    );
  }
});
