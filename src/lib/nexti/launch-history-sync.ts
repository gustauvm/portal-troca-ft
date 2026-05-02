import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  fetchAllPages,
  fetchNextiToken,
  nextiDateTimeToIsoDate,
  nextiDateTimeToIsoString,
} from "@/lib/nexti/client";
import { getPayrollWindowForDate } from "@/lib/utils/payroll";

type HistoryInsert = Database["public"]["Tables"]["nexti_launch_history"]["Insert"];
type EmployeeRow = Pick<
  Database["public"]["Tables"]["employee_directory"]["Row"],
  | "id"
  | "nexti_person_id"
  | "person_external_id"
  | "enrolment"
  | "full_name"
  | "group_key"
  | "company_id"
  | "company_name"
  | "career_id"
  | "career_name"
  | "schedule_id"
  | "schedule_name"
  | "shift_id"
  | "shift_external_id"
  | "shift_name"
  | "workplace_id"
  | "workplace_external_id"
  | "workplace_name"
  | "admission_date"
  | "is_active"
>;

type NextiScheduleTransfer = {
  id?: number;
  personId?: number;
  personExternalId?: string;
  scheduleId?: number;
  scheduleExternalId?: string;
  rotationId?: number;
  rotationCode?: number;
  transferDateTime?: string;
  lastUpdate?: string;
  removed?: boolean;
  observation?: string;
};

type NextiReplacement = {
  id?: number;
  personId?: number;
  personExternalId?: string;
  personName?: string;
  absenteeId?: number;
  absenteeExternalId?: string;
  absenteeName?: string;
  workplaceId?: number;
  workplaceExternalId?: string;
  startDateTime?: string;
  finishDateTime?: string;
  replacementTypeId?: number;
  note?: string;
  registerDate?: string;
  replacementReasonName?: string;
  shiftExternalId?: string;
  shiftId?: number;
  lastUpdate?: string;
  removed?: boolean;
};

type SyncInput = {
  start?: string | null;
  finish?: string | null;
  mode?: "incremental" | "backfill";
};

function compactNumbers(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value || 0))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
}

function compactStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function dateToNextiDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${date.getFullYear()}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeCursor(value?: string | null, fallback?: Date) {
  if (value && /^\d{14}$/.test(value)) return value;
  if (value) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return dateToNextiDateTime(parsed);
  }
  return dateToNextiDateTime(fallback || new Date());
}

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

async function readSyncState(syncKey: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("nexti_launch_history_sync_state")
    .select("last_cursor_finish")
    .eq("sync_key", syncKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao consultar cursor de historico Nexti: ${error.message}`);
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
  const { error } = await supabase.from("nexti_launch_history_sync_state").upsert(
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
    throw new Error(`Falha ao gravar cursor de historico Nexti: ${error.message}`);
  }
}

async function fetchScheduleTransfers(token: string, start: string, finish: string) {
  try {
    return await fetchAllPages<NextiScheduleTransfer>(
      `/scheduletransfers/lastupdate/start/${encodeURIComponent(start)}/finish/${encodeURIComponent(finish)}`,
      token,
      {},
      250,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Não foi encontrado nenhum dado") || error.message.includes("Registro nao encontrado"))
    ) {
      return [];
    }
    throw error;
  }
}

async function fetchReplacements(token: string, start: string, finish: string) {
  try {
    return await fetchAllPages<NextiReplacement>(
      `/replacements/lastupdate/start/${encodeURIComponent(start)}/finish/${encodeURIComponent(finish)}`,
      token,
      {},
      250,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Não foi encontrado nenhum dado") || error.message.includes("Registro nao encontrado"))
    ) {
      return [];
    }
    throw error;
  }
}

async function loadEmployeeIndex(personIds: number[], personExternalIds: string[] = []) {
  const supabase = createSupabaseAdminClient();
  const rows: EmployeeRow[] = [];
  for (const batch of chunks(personIds, 500)) {
    const { data, error } = await supabase
      .from("employee_directory")
      .select(
        "id, nexti_person_id, person_external_id, enrolment, full_name, group_key, company_id, company_name, career_id, career_name, schedule_id, schedule_name, shift_id, shift_external_id, shift_name, workplace_id, workplace_external_id, workplace_name, admission_date, is_active",
      )
      .in("nexti_person_id", batch);

    if (error) {
      throw new Error(`Falha ao consultar diretorio local: ${error.message}`);
    }
    rows.push(...((data || []) as EmployeeRow[]));
  }

  for (const batch of chunks(personExternalIds, 500)) {
    const { data, error } = await supabase
      .from("employee_directory")
      .select(
        "id, nexti_person_id, person_external_id, enrolment, full_name, group_key, company_id, company_name, career_id, career_name, schedule_id, schedule_name, shift_id, shift_external_id, shift_name, workplace_id, workplace_external_id, workplace_name, admission_date, is_active",
      )
      .in("person_external_id", batch);

    if (error) {
      throw new Error(`Falha ao consultar diretorio local por ID externo: ${error.message}`);
    }
    rows.push(...((data || []) as EmployeeRow[]));
  }

  const byPersonId = new Map<number, EmployeeRow>();
  const byExternalId = new Map<string, EmployeeRow>();
  rows
    .sort((left, right) => Number(right.is_active) - Number(left.is_active))
    .forEach((row) => {
      if (!byPersonId.has(Number(row.nexti_person_id))) {
        byPersonId.set(Number(row.nexti_person_id), row);
      }
      if (row.person_external_id && !byExternalId.has(row.person_external_id)) {
        byExternalId.set(row.person_external_id, row);
      }
    });

  return { byPersonId, byExternalId };
}

type EmployeeIndex = Awaited<ReturnType<typeof loadEmployeeIndex>>;

function findEmployeeInIndex(index: EmployeeIndex, personId?: number | null, personExternalId?: string | null) {
  if (personId && index.byPersonId.has(Number(personId))) {
    return index.byPersonId.get(Number(personId)) || null;
  }

  const externalId = String(personExternalId || "").trim();
  if (externalId && index.byExternalId.has(externalId)) {
    return index.byExternalId.get(externalId) || null;
  }

  return null;
}

function buildHistoryBase(input: {
  requestType: "swap" | "ft";
  nextiSource: "schedule_transfer" | "replacement";
  nextiRecordId: number;
  employee: EmployeeRow | null;
  requestDate: string;
  rawPayload: Json;
  nextiLastUpdate?: string | null;
  nextiCreatedAt?: string | null;
}): HistoryInsert {
  const payroll = getPayrollWindowForDate(input.requestDate);
  return {
    request_type: input.requestType,
    nexti_source: input.nextiSource,
    nexti_record_id: input.nextiRecordId,
    nexti_record_external_id: null,
    group_key: input.employee?.group_key || "nao_mapeado",
    payroll_reference: payroll.reference,
    payroll_period_start: payroll.periodStart,
    payroll_period_end: payroll.periodEnd,
    requester_employee_id: input.employee?.id || null,
    requester_nexti_person_id: input.employee?.nexti_person_id || null,
    requester_person_external_id: input.employee?.person_external_id || null,
    requester_name: input.employee?.full_name || `Pessoa Nexti ${input.nextiRecordId}`,
    requester_enrolment: input.employee?.enrolment || null,
    requester_is_active: input.employee?.is_active || false,
    substitute_nexti_person_id: null,
    substitute_person_external_id: null,
    substitute_name: null,
    substitute_enrolment: null,
    company_id: input.employee?.company_id || null,
    company_name: input.employee?.company_name || null,
    career_id: input.employee?.career_id || null,
    career_name: input.employee?.career_name || null,
    schedule_id: input.employee?.schedule_id || null,
    schedule_name: input.employee?.schedule_name || null,
    shift_id: input.employee?.shift_id || null,
    shift_external_id: input.employee?.shift_external_id || null,
    shift_name: input.employee?.shift_name || null,
    workplace_id: input.employee?.workplace_id || null,
    workplace_external_id: input.employee?.workplace_external_id || null,
    workplace_name: input.employee?.workplace_name || null,
    request_date: input.requestDate,
    coverage_date: null,
    nexti_created_at: input.nextiCreatedAt ? nextiDateTimeToIsoString(input.nextiCreatedAt) : null,
    nexti_last_update: input.nextiLastUpdate ? nextiDateTimeToIsoString(input.nextiLastUpdate) : null,
    raw_payload: input.rawPayload,
    last_synced_at: new Date().toISOString(),
  };
}

function mapScheduleTransfer(item: NextiScheduleTransfer, employeeIndex: EmployeeIndex): HistoryInsert | null {
  const id = Number(item.id || 0);
  const requestDate = nextiDateTimeToIsoDate(item.transferDateTime);
  if (!id || !requestDate || item.removed) return null;
  const employee = findEmployeeInIndex(employeeIndex, item.personId, item.personExternalId);
  const row = buildHistoryBase({
    requestType: "swap",
    nextiSource: "schedule_transfer",
    nextiRecordId: id,
    employee,
    requestDate,
    rawPayload: item as Json,
    nextiLastUpdate: item.lastUpdate || null,
  });

  row.requester_nexti_person_id = item.personId ? Number(item.personId) : row.requester_nexti_person_id;
  row.requester_person_external_id = item.personExternalId || row.requester_person_external_id;
  row.schedule_id = item.scheduleId ? Number(item.scheduleId) : row.schedule_id;
  row.raw_payload = {
    ...item,
    importedAs: "Permuta (Troca de Folga)",
  } as Json;
  return row;
}

function mapReplacement(item: NextiReplacement, employeeIndex: EmployeeIndex): HistoryInsert | null {
  const id = Number(item.id || 0);
  const requestDate = nextiDateTimeToIsoDate(item.startDateTime);
  if (!id || !requestDate || item.removed) return null;
  const employee = findEmployeeInIndex(employeeIndex, item.personId, item.personExternalId);
  const absentee = findEmployeeInIndex(employeeIndex, item.absenteeId, item.absenteeExternalId);
  const row = buildHistoryBase({
    requestType: "ft",
    nextiSource: "replacement",
    nextiRecordId: id,
    employee,
    requestDate,
    rawPayload: item as Json,
    nextiCreatedAt: item.registerDate || null,
    nextiLastUpdate: item.lastUpdate || null,
  });

  row.requester_nexti_person_id = item.personId ? Number(item.personId) : row.requester_nexti_person_id;
  row.requester_person_external_id = item.personExternalId || row.requester_person_external_id;
  row.requester_name = item.personName || row.requester_name;
  row.substitute_nexti_person_id = item.absenteeId ? Number(item.absenteeId) : null;
  row.substitute_person_external_id = item.absenteeExternalId || absentee?.person_external_id || null;
  row.substitute_name = item.absenteeName || absentee?.full_name || null;
  row.substitute_enrolment = absentee?.enrolment || null;
  row.workplace_id = item.workplaceId ? Number(item.workplaceId) : row.workplace_id;
  row.workplace_external_id = item.workplaceExternalId || row.workplace_external_id;
  row.shift_id = item.shiftId ? Number(item.shiftId) : row.shift_id;
  row.shift_external_id = item.shiftExternalId || row.shift_external_id;
  row.coverage_date = nextiDateTimeToIsoDate(item.finishDateTime);
  row.raw_payload = {
    ...item,
    importedAs: "FT",
  } as Json;
  return row;
}

async function upsertHistory(rows: HistoryInsert[]) {
  if (rows.length === 0) return;
  const supabase = createSupabaseAdminClient();
  for (const batch of chunks(rows, 250)) {
    const { error } = await supabase
      .from("nexti_launch_history")
      .upsert(batch, { onConflict: "nexti_source,nexti_record_id", ignoreDuplicates: false });

    if (error) {
      throw new Error(`Falha ao gravar historico Nexti: ${error.message}`);
    }
  }
}

function employeeHistoryFields(employee: EmployeeRow) {
  return {
    group_key: employee.group_key,
    requester_employee_id: employee.id,
    requester_nexti_person_id: employee.nexti_person_id,
    requester_person_external_id: employee.person_external_id,
    requester_name: employee.full_name,
    requester_enrolment: employee.enrolment,
    requester_is_active: employee.is_active,
    company_id: employee.company_id,
    company_name: employee.company_name,
    career_id: employee.career_id,
    career_name: employee.career_name,
    schedule_id: employee.schedule_id,
    schedule_name: employee.schedule_name,
    shift_id: employee.shift_id,
    shift_external_id: employee.shift_external_id,
    shift_name: employee.shift_name,
    workplace_id: employee.workplace_id,
    workplace_external_id: employee.workplace_external_id,
    workplace_name: employee.workplace_name,
    last_synced_at: new Date().toISOString(),
  } satisfies Database["public"]["Tables"]["nexti_launch_history"]["Update"];
}

async function relinkNextiLaunchHistory(limit = 1000) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("nexti_launch_history")
    .select("id, requester_nexti_person_id, requester_person_external_id")
    .is("requester_employee_id", null)
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao buscar historico Nexti sem vinculo: ${error.message}`);
  }

  const rows = (data || []) as Array<{
    id: string;
    requester_nexti_person_id: number | null;
    requester_person_external_id: string | null;
  }>;
  if (rows.length === 0) return 0;

  const employeeIndex = await loadEmployeeIndex(
    compactNumbers(rows.map((row) => row.requester_nexti_person_id)),
    compactStrings(rows.map((row) => row.requester_person_external_id)),
  );
  let relinked = 0;

  for (const row of rows) {
    const employee = findEmployeeInIndex(employeeIndex, row.requester_nexti_person_id, row.requester_person_external_id);
    if (!employee) continue;

    const { error: updateError } = await supabase
      .from("nexti_launch_history")
      .update(employeeHistoryFields(employee))
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Falha ao vincular historico Nexti: ${updateError.message}`);
    }
    relinked += 1;
  }

  return relinked;
}

export async function syncNextiLaunchHistory(input: SyncInput = {}) {
  const mode = input.mode || "incremental";
  const syncKey = `launch-history:${mode}`;
  const previousFinish = mode === "incremental" ? await readSyncState(syncKey) : null;
  const now = new Date();
  const start = normalizeCursor(input.start || previousFinish, subtractDays(now, mode === "incremental" ? 10 : 31));
  const finish = normalizeCursor(input.finish, now);
  const token = await fetchNextiToken();

  try {
    const [scheduleTransfers, replacements] = await Promise.all([
      fetchScheduleTransfers(token, start, finish),
      fetchReplacements(token, start, finish),
    ]);

    const personIds = compactNumbers([
      ...scheduleTransfers.map((item) => item.personId),
      ...replacements.flatMap((item) => [item.personId, item.absenteeId]),
    ]);
    const personExternalIds = compactStrings([
      ...scheduleTransfers.map((item) => item.personExternalId),
      ...replacements.flatMap((item) => [item.personExternalId, item.absenteeExternalId]),
    ]);
    const employeeIndex = await loadEmployeeIndex(personIds, personExternalIds);
    const rows = [
      ...scheduleTransfers.map((item) => mapScheduleTransfer(item, employeeIndex)),
      ...replacements.map((item) => mapReplacement(item, employeeIndex)),
    ].filter((row): row is HistoryInsert => row !== null);

    await upsertHistory(rows);
    const relinked = await relinkNextiLaunchHistory();
    await writeSyncState({
      syncKey,
      start,
      finish,
      metadata: {
        mode,
        fetchedScheduleTransfers: scheduleTransfers.length,
        fetchedReplacements: replacements.length,
        upserted: rows.length,
        relinked,
      } satisfies Json,
    });

    return {
      ok: true,
      mode,
      start,
      finish,
      fetchedScheduleTransfers: scheduleTransfers.length,
      fetchedReplacements: replacements.length,
      upserted: rows.length,
      relinked,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar historico Nexti.";
    await writeSyncState({
      syncKey,
      start,
      finish,
      errorMessage: message,
      metadata: {
        mode,
        failedAt: new Date().toISOString(),
      } satisfies Json,
    });
    throw error;
  }
}
