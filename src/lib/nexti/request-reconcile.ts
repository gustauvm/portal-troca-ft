import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  fetchAllPages,
  fetchNextiToken,
  getNextiDayRange,
  isSameNextiDay,
  nextiDateTimeToIsoDate,
} from "@/lib/nexti/client";

type PortalRequestRow = Database["public"]["Tables"]["portal_requests"]["Row"];

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

type SnapshotPerson = {
  nextiPersonId?: number | null;
  personExternalId?: string | null;
  scheduleId?: number | null;
  scheduleExternalId?: string | null;
  rotationId?: number | null;
  rotationCode?: number | null;
};

type RequestSnapshot = {
  requester?: SnapshotPerson;
  substitute?: SnapshotPerson | null;
};

type SwapTransferExpected = {
  personId: number;
  personExternalId: string | null;
  scheduleId: number | null;
  scheduleExternalId: string | null;
  rotationId: number | null;
  rotationCode: number | null;
  transferDateTime: string;
};

type ReconcileInput = {
  requestId?: string | null;
  group?: string | null;
  limit?: number;
  start?: string | null;
  finish?: string | null;
};

function normalizeLimit(value: number | undefined) {
  const parsed = Number.parseInt(String(value || "100"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }
  return Math.min(parsed, 300);
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function requestDateToIso(value: PortalRequestRow["request_date"]) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function scheduleTransferDateToIso(value?: string | null) {
  return nextiDateTimeToIsoDate(value);
}

function buildPersonIndexKey(personId: number | null | undefined, isoDate: string | null) {
  if (!personId || !isoDate) return null;
  return `${personId}|${isoDate}`;
}

function pushToPersonIndex<T extends { personId?: number }>(
  index: Map<string, T[]>,
  personId: number | undefined,
  isoDate: string | null,
  item: T,
) {
  const key = buildPersonIndexKey(personId, isoDate);
  if (!key) return;
  const rows = index.get(key) || [];
  rows.push(item);
  index.set(key, rows);
}

function asSnapshot(value: Json): RequestSnapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RequestSnapshot : {};
}

function formatNextiTransferDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Data invalida para conciliacao: ${date}`);
  }
  const [, year, month, day] = match;
  return `${day}${month}${year}000000`;
}

function buildSwapTransferPreview(request: PortalRequestRow): SwapTransferExpected[] {
  const snapshot = asSnapshot(request.request_snapshot);
  const requester = snapshot.requester || {};
  const substitute = snapshot.substitute || {};
  const coverageDate = request.coverage_date ? requestDateToIso(request.coverage_date) : null;

  if (!coverageDate) {
    throw new Error("Permuta sem data de compensacao para reconciliacao.");
  }

  return [
    {
      personId: Number(request.requester_nexti_person_id || requester.nextiPersonId),
      personExternalId: String(request.requester_person_external_id || requester.personExternalId || "").trim() || null,
      scheduleId: requester.scheduleId ?? request.schedule_id ?? null,
      scheduleExternalId: requester.scheduleExternalId ?? null,
      rotationId: substitute.rotationId ?? null,
      rotationCode: substitute.rotationCode ?? null,
      transferDateTime: formatNextiTransferDate(requestDateToIso(request.request_date)),
    },
    {
      personId: Number(request.substitute_nexti_person_id || substitute.nextiPersonId),
      personExternalId: String(request.substitute_person_external_id || substitute.personExternalId || "").trim() || null,
      scheduleId: substitute.scheduleId ?? null,
      scheduleExternalId: substitute.scheduleExternalId ?? null,
      rotationId: requester.rotationId ?? null,
      rotationCode: requester.rotationCode ?? null,
      transferDateTime: formatNextiTransferDate(coverageDate),
    },
  ];
}

function matchesScheduleTransfer(candidate: NextiScheduleTransfer, expected: SwapTransferExpected) {
  if (candidate.removed) return false;
  if (candidate.personId && Number(candidate.personId) !== expected.personId) return false;
  if (!isSameNextiDay(scheduleTransferDateToIso(expected.transferDateTime) || "", candidate.transferDateTime)) return false;

  const scheduleKnown = Boolean(expected.scheduleId || expected.scheduleExternalId);
  const rotationKnown = typeof expected.rotationCode === "number";
  const scheduleMatches =
    !scheduleKnown ||
    (typeof expected.scheduleId === "number" && Number(candidate.scheduleId) === expected.scheduleId) ||
    (expected.scheduleExternalId && normalizeText(candidate.scheduleExternalId) === normalizeText(expected.scheduleExternalId));
  const rotationMatches = !rotationKnown || Number(candidate.rotationCode) === Number(expected.rotationCode);

  return scheduleMatches && rotationMatches;
}

function matchesReplacement(candidate: NextiReplacement, request: PortalRequestRow) {
  if (candidate.removed) return false;
  if (candidate.personId && Number(candidate.personId) !== Number(request.requester_nexti_person_id)) return false;
  if (!isSameNextiDay(requestDateToIso(request.request_date), candidate.startDateTime)) return false;

  if (request.workplace_id) {
    return Number(candidate.workplaceId) === Number(request.workplace_id);
  }

  if (request.workplace_external_id) {
    return normalizeText(candidate.workplaceExternalId) === normalizeText(request.workplace_external_id);
  }

  return [1, 2, 3, 5].includes(Number(candidate.replacementTypeId || 0));
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

async function fetchExactScheduleTransfers(token: string, expected: SwapTransferExpected) {
  const isoDate = scheduleTransferDateToIso(expected.transferDateTime);
  if (!isoDate) return [];
  const dayRange = getNextiDayRange(isoDate);
  return fetchAllPages<NextiScheduleTransfer>(
    `/scheduletransfers/person/${expected.personId}/start/${dayRange.start}/finish/${dayRange.finish}`,
    token,
    {},
    100,
  );
}

async function fetchExactReplacements(token: string, request: PortalRequestRow) {
  const dayRange = getNextiDayRange(requestDateToIso(request.request_date));
  return fetchAllPages<NextiReplacement>(
    `/replacements/person/${Number(request.requester_nexti_person_id)}/start/${dayRange.start}/finish/${dayRange.finish}`,
    token,
    {},
    100,
  );
}

async function readSyncState(syncKey: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("nexti_sync_state")
    .select("last_cursor_finish")
    .eq("sync_key", syncKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao consultar cursor de conciliacao: ${error.message}`);
  }

  return data?.last_cursor_finish || null;
}

async function writeSyncState(input: {
  syncKey: string;
  start: string;
  finish: string;
  metadata: Json;
  errorMessage?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("nexti_sync_state").upsert(
    {
      sync_key: input.syncKey,
      last_cursor_start: input.start,
      last_cursor_finish: input.finish,
      last_success_at: input.errorMessage ? null : new Date().toISOString(),
      last_error: input.errorMessage || null,
      metadata: input.metadata,
    },
    { onConflict: "sync_key", ignoreDuplicates: false },
  );

  if (error) {
    throw new Error(`Falha ao atualizar cursor de conciliacao: ${error.message}`);
  }
}

async function appendSystemEvent(requestId: string, eventType: string, payload: Json) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("request_events").insert({
    request_id: requestId,
    actor_type: "system",
    actor_id: null,
    actor_label: "Nexti reconcile",
    event_type: eventType,
    payload,
  });
}

async function updateRequestMatch(input: {
  request: PortalRequestRow;
  nextStatus: "matched" | "not_found" | "error";
  launchError?: string | null;
  matchPayload: Json;
}) {
  const supabase = createSupabaseAdminClient();
  const patch: Database["public"]["Tables"]["portal_requests"]["Update"] = {
    launch_status: input.nextStatus,
    launch_error: input.launchError || null,
    launched_at: input.nextStatus === "matched" ? new Date().toISOString() : null,
    nexti_match_payload: input.matchPayload,
  };
  const { error } = await supabase.from("portal_requests").update(patch).eq("id", input.request.id);

  if (error) {
    throw new Error(`Falha ao atualizar conciliacao da solicitacao ${input.request.id}: ${error.message}`);
  }

  if (input.nextStatus === "matched" && input.request.launch_status !== "matched") {
    await appendSystemEvent(input.request.id, "launch_matched", input.matchPayload);
  } else if (input.nextStatus === "not_found" && input.request.launch_status !== "not_found") {
    await appendSystemEvent(input.request.id, "launch_not_found", input.matchPayload);
  } else if (input.nextStatus === "error" && (input.request.launch_status !== "error" || input.launchError)) {
    await appendSystemEvent(input.request.id, "launch_error", {
      payload: input.matchPayload,
      error: input.launchError || null,
    } satisfies Json);
  }
}

function buildReconcileWindow(inputStart: string | null | undefined, previousFinish: string | null, now: Date) {
  if (inputStart) return inputStart;
  if (previousFinish) return previousFinish;
  return subtractMinutes(subtractDays(now, 45), 5).toISOString();
}

export async function reconcileNextiRequests(input: ReconcileInput = {}) {
  const limit = normalizeLimit(input.limit);
  const supabase = createSupabaseAdminClient();
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
    throw new Error(`Falha ao consultar solicitacoes para conciliacao: ${error.message}`);
  }

  const requests = (data || []) as PortalRequestRow[];
  if (requests.length === 0) {
    return {
      ok: true,
      processed: 0,
      matched: 0,
      notFound: 0,
      errors: 0,
      items: [],
    };
  }

  const token = await fetchNextiToken();
  const now = new Date();
  const nowIso = now.toISOString();
  const needsScheduleTransfers = requests.some((request) => request.request_type === "swap");
  const needsReplacements = requests.some((request) => request.request_type === "ft");
  const [schedulePreviousFinish, replacementPreviousFinish] = await Promise.all([
    needsScheduleTransfers ? readSyncState("reconcile:schedule_transfer") : Promise.resolve(null),
    needsReplacements ? readSyncState("reconcile:replacement") : Promise.resolve(null),
  ]);
  const scheduleStart = buildReconcileWindow(input.start, schedulePreviousFinish, now);
  const replacementStart = buildReconcileWindow(input.start, replacementPreviousFinish, now);
  const windowFinish = input.finish || nowIso;

  const [scheduleTransfers, replacements] = await Promise.all([
    needsScheduleTransfers ? fetchScheduleTransfersByUpdateWindow(token, scheduleStart, windowFinish) : Promise.resolve([]),
    needsReplacements ? fetchReplacementsByUpdateWindow(token, replacementStart, windowFinish) : Promise.resolve([]),
  ]);

  const scheduleIndex = new Map<string, NextiScheduleTransfer[]>();
  scheduleTransfers.forEach((item) => {
    pushToPersonIndex(scheduleIndex, item.personId, scheduleTransferDateToIso(item.transferDateTime), item);
  });

  const replacementIndex = new Map<string, NextiReplacement[]>();
  replacements.forEach((item) => {
    pushToPersonIndex(replacementIndex, item.personId, nextiDateTimeToIsoDate(item.startDateTime), item);
  });

  const items: Array<{
    requestId: string;
    requestType: "swap" | "ft";
    launchStatus: "matched" | "not_found" | "error";
    source: "schedule_transfer" | "replacement";
    error?: string;
  }> = [];
  let matched = 0;
  let notFound = 0;
  let errors = 0;

  for (const request of requests) {
    try {
      if (request.request_type === "swap") {
        const preview = buildSwapTransferPreview(request);
        let foundTransfers = preview.map((expected) => {
          const key = buildPersonIndexKey(expected.personId, scheduleTransferDateToIso(expected.transferDateTime));
          const candidates = key ? scheduleIndex.get(key) || [] : [];
          return candidates.find((candidate) => matchesScheduleTransfer(candidate, expected)) || null;
        });

        if (foundTransfers.some((item) => item === null)) {
          foundTransfers = await Promise.all(
            preview.map(async (expected) => {
              const exactCandidates = await fetchExactScheduleTransfers(token, expected);
              return exactCandidates.find((candidate) => matchesScheduleTransfer(candidate, expected)) || null;
            }),
          );
        }

        const allMatched = foundTransfers.every((item) => item !== null);
        const matchPayload = {
          source: "schedule_transfer",
          checkedAt: nowIso,
          window: {
            start: scheduleStart,
            finish: windowFinish,
          },
          expected: preview,
          foundTransfers,
        } satisfies Json;

        await updateRequestMatch({
          request,
          nextStatus: allMatched ? "matched" : "not_found",
          matchPayload,
        });

        if (allMatched) matched += 1;
        else notFound += 1;
        items.push({
          requestId: request.id,
          requestType: request.request_type,
          launchStatus: allMatched ? "matched" : "not_found",
          source: "schedule_transfer",
        });
        continue;
      }

      const key = buildPersonIndexKey(Number(request.requester_nexti_person_id), requestDateToIso(request.request_date));
      let replacementCandidates = key ? replacementIndex.get(key) || [] : [];
      if (replacementCandidates.length === 0) {
        replacementCandidates = await fetchExactReplacements(token, request);
      }

      const replacement = replacementCandidates.find((candidate) => matchesReplacement(candidate, request)) || null;
      const matchPayload = {
        source: "replacement",
        checkedAt: nowIso,
        window: {
          start: replacementStart,
          finish: windowFinish,
        },
        candidateCount: replacementCandidates.length,
        replacement,
      } satisfies Json;

      await updateRequestMatch({
        request,
        nextStatus: replacement ? "matched" : "not_found",
        matchPayload,
      });

      if (replacement) matched += 1;
      else notFound += 1;
      items.push({
        requestId: request.id,
        requestType: request.request_type,
        launchStatus: replacement ? "matched" : "not_found",
        source: "replacement",
      });
    } catch (requestError) {
      errors += 1;
      const message = requestError instanceof Error ? requestError.message : "Falha na conciliacao da solicitacao.";
      await updateRequestMatch({
        request,
        nextStatus: "error",
        launchError: message,
        matchPayload: {
          checkedAt: nowIso,
          error: message,
        } satisfies Json,
      });
      items.push({
        requestId: request.id,
        requestType: request.request_type,
        launchStatus: "error",
        source: request.request_type === "swap" ? "schedule_transfer" : "replacement",
        error: message,
      });
    }
  }

  await Promise.all([
    needsScheduleTransfers
      ? writeSyncState({
          syncKey: "reconcile:schedule_transfer",
          start: scheduleStart,
          finish: windowFinish,
          metadata: {
            checkedAt: nowIso,
            fetched: scheduleTransfers.length,
            processedRequests: requests.filter((request) => request.request_type === "swap").length,
          } satisfies Json,
        })
      : Promise.resolve(),
    needsReplacements
      ? writeSyncState({
          syncKey: "reconcile:replacement",
          start: replacementStart,
          finish: windowFinish,
          metadata: {
            checkedAt: nowIso,
            fetched: replacements.length,
            processedRequests: requests.filter((request) => request.request_type === "ft").length,
          } satisfies Json,
        })
      : Promise.resolve(),
  ]);

  return {
    ok: true,
    processed: requests.length,
    matched,
    notFound,
    errors,
    items,
  };
}
