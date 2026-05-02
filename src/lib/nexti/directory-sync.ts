import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { buildEnrolmentAliases, normalizeDigits } from "@/lib/utils/identity";
import { normalizeBrazilWhatsappPhone } from "@/lib/utils/phone";
import { fetchAllPages, fetchNextiToken, nextiDateTimeToIsoDate, nextiRequest, unwrapValue } from "@/lib/nexti/client";
import {
  findGroupKeyByCompanyId,
  getRequestedGroups,
  type NextiGroupConfig,
} from "@/lib/nexti/group-config";

type EmployeeInsert = Database["public"]["Tables"]["employee_directory"]["Insert"];
type WorkplaceInsert = Database["public"]["Tables"]["workplace_directory"]["Insert"];
type ShiftInsert = Database["public"]["Tables"]["shift_directory"]["Insert"];

type NextiWorkplace = {
  id?: number;
  businessUnitId?: number;
  businessUnitName?: string;
  companyId?: number;
  externalId?: string;
  name?: string;
  clientName?: string;
  companyName?: string;
  companyNumber?: string;
  externalCompanyId?: string;
  service?: string;
  active?: boolean;
  finishDate?: string;
};

type NextiPerson = {
  id?: number;
  externalId?: string;
  enrolment?: string;
  name?: string;
  cpf?: string;
  phone?: string;
  phone2?: string;
  businessUnitId?: number;
  businessUnitName?: string;
  workplaceId?: number;
  workplaceName?: string;
  externalWorkplaceId?: string;
  companyId?: number;
  externalCompanyId?: string;
  companyName?: string;
  companyNumber?: string;
  scheduleId?: number;
  externalScheduleId?: string;
  shiftId?: number;
  externalShiftId?: string;
  rotationId?: number;
  rotationCode?: number;
  careerId?: number;
  externalCareerId?: string;
  nameCareer?: string;
  nameSchedule?: string;
  personSituationId?: number;
  admissionDate?: string;
  registerDate?: string;
};

type NextiCompany = {
  id?: number;
  externalId?: string;
  companyName?: string;
  companyNumber?: string;
};

type NextiNamedEntity = {
  id?: number;
  externalId?: string;
  name?: string;
  active?: boolean;
};

type Lookup<T extends { id?: number; externalId?: string }> = {
  byId: Map<number, T>;
  byExternalId: Map<string, T>;
};

type DirectorySource = {
  syncedAt: string;
  workplaces: NextiWorkplace[];
  persons: NextiPerson[];
  shifts: NextiNamedEntity[];
  workplaceLookup: Lookup<NextiWorkplace>;
  companyLookup: Lookup<NextiCompany>;
  careerLookup: Map<string, string>;
  scheduleLookup: Map<string, string>;
  shiftLookup: Map<string, string>;
};

function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function includesAny(target: unknown, values: string[] = []) {
  const normalizedTarget = normalize(target);
  return values.some((value) => normalizedTarget.includes(normalize(value)));
}

function equalsAnyNumber(target: unknown, values: number[] = []) {
  const numericTarget = Number(target);
  return Number.isFinite(numericTarget) && values.includes(numericTarget);
}

function buildLookup<T extends { id?: number; externalId?: string }>(items: T[]): Lookup<T> {
  const byId = new Map<number, T>();
  const byExternalId = new Map<string, T>();

  items.forEach((item) => {
    if (item.id) byId.set(Number(item.id), item);
    const externalId = normalize(item.externalId);
    if (externalId) byExternalId.set(externalId, item);
  });

  return { byId, byExternalId };
}

function buildNameLookup(items: NextiNamedEntity[]) {
  const map = new Map<string, string>();

  items.forEach((item) => {
    if (item.id) map.set(`id:${item.id}`, String(item.name || "").trim());
    if (item.externalId) map.set(`external:${item.externalId}`, String(item.name || "").trim());
  });

  return map;
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function deriveShiftTurn(name: unknown): "diurno" | "noturno" | "indefinido" {
  const normalized = removeAccents(normalize(name));
  if (normalized.includes("NOTURNO") || normalized.includes("NOITE") || normalized.includes("19") || normalized.includes("18:")) {
    return "noturno";
  }
  if (normalized.includes("DIURNO") || normalized.includes("DIA") || normalized.includes("07") || normalized.includes("06:")) {
    return "diurno";
  }
  return "indefinido";
}

function isPreAssignedShift(name: unknown) {
  const normalized = removeAccents(normalize(name));
  return normalized.includes("PRE ASSINALADO") || normalized.includes("PRE-ASSINALADO");
}

function mapShiftRow(shift: NextiNamedEntity, syncedAt: string): ShiftInsert | null {
  const nextiShiftId = Number(shift.id || 0);
  const name = String(shift.name || "").trim();
  if (!nextiShiftId || !name) return null;

  return {
    nexti_shift_id: nextiShiftId,
    shift_external_id: String(shift.externalId || "").trim() || null,
    name,
    turn: deriveShiftTurn(name),
    is_pre_assigned: isPreAssignedShift(name),
    is_active: shift.active !== false,
    sync_fingerprint: JSON.stringify({
      id: shift.id,
      externalId: shift.externalId,
      name: shift.name,
      active: shift.active !== false,
    }),
    last_synced_at: syncedAt,
  };
}

function requiresWorkplaceScope(config: NextiGroupConfig) {
  return Boolean(
    config.serviceIncludes?.length ||
      config.serviceExcludes?.length ||
      config.workplaceNameIncludes?.length ||
      config.workplaceExternalIds?.length ||
      config.companyNumbers?.length,
  );
}

function matchesWorkplace(workplace: NextiWorkplace, config: NextiGroupConfig) {
  if (config.businessUnitIds?.length && equalsAnyNumber(workplace.businessUnitId, config.businessUnitIds)) {
    if (config.serviceIncludes?.length && !includesAny(workplace.service, config.serviceIncludes)) return false;
    if (config.serviceExcludes?.length && includesAny(workplace.service, config.serviceExcludes)) return false;
    return true;
  }

  if (config.companyIds?.length && equalsAnyNumber(workplace.companyId, config.companyIds)) {
    if (config.serviceIncludes?.length && !includesAny(workplace.service, config.serviceIncludes)) return false;
    if (config.serviceExcludes?.length && includesAny(workplace.service, config.serviceExcludes)) return false;
    return true;
  }

  if (config.workplaceExternalIds?.some((id) => normalize(id) === normalize(workplace.externalId))) return true;
  if (config.companyNumbers?.some((number) => normalize(number) === normalize(workplace.companyNumber))) return true;
  if (config.companyNameIncludes?.length && includesAny(workplace.companyName, config.companyNameIncludes)) return true;
  if (config.workplaceNameIncludes?.length && includesAny(workplace.name, config.workplaceNameIncludes)) return true;
  return false;
}

function matchesPerson(
  person: NextiPerson,
  config: NextiGroupConfig,
  allowedWorkplaceIds: Set<number>,
  allowedWorkplaceExternalIds: Set<string>,
) {
  if (config.businessUnitIds?.length && !equalsAnyNumber(person.businessUnitId, config.businessUnitIds)) return false;
  if (config.companyIds?.length && !equalsAnyNumber(person.companyId, config.companyIds)) return false;
  if (config.careerIds?.length && !equalsAnyNumber(person.careerId, config.careerIds)) return false;
  if (config.careerNameIncludes?.length && !includesAny(person.nameCareer, config.careerNameIncludes)) return false;

  const useWorkplaceScope =
    requiresWorkplaceScope(config) && (allowedWorkplaceIds.size > 0 || allowedWorkplaceExternalIds.size > 0);
  if (!useWorkplaceScope) return true;
  if (person.workplaceId && allowedWorkplaceIds.has(Number(person.workplaceId))) return true;
  if (person.externalWorkplaceId && allowedWorkplaceExternalIds.has(normalize(person.externalWorkplaceId))) return true;
  return false;
}

function getSituationLabel(personSituationId?: number | null) {
  const value = Number(personSituationId || 1);
  if (value === 1) return "ATIVO";
  if (value === 2) return "AUSENTE";
  if (value === 3) return "DEMITIDO";
  if (value === 4) return "INATIVO";
  return `SITUACAO_${value}`;
}

function mapEmployeeRow(groupKey: string, person: NextiPerson, source: DirectorySource): EmployeeInsert {
  const nextiPersonId = Number(person.id || 0);
  const personExternalId = String(person.externalId || "").trim() || `NEXTI_PERSON_${nextiPersonId}`;
  const company = source.companyLookup.byId.get(Number(person.companyId)) || {};
  const workplace = person.workplaceId ? source.workplaceLookup.byId.get(Number(person.workplaceId)) : null;
  const careerKey = person.careerId ? `id:${person.careerId}` : `external:${person.externalCareerId || ""}`;
  const scheduleKey = person.scheduleId ? `id:${person.scheduleId}` : `external:${person.externalScheduleId || ""}`;
  const shiftKey = person.shiftId ? `id:${person.shiftId}` : `external:${person.externalShiftId || ""}`;
  const situationId = Number(person.personSituationId || 1);
  const phone = String(person.phone || "").trim() || null;
  const phone2 = String(person.phone2 || "").trim() || null;

  return {
    group_key: groupKey,
    nexti_person_id: nextiPersonId,
    person_external_id: personExternalId,
    enrolment: String(person.enrolment || "").trim(),
    enrolment_aliases: buildEnrolmentAliases(person.enrolment),
    cpf_digits: normalizeDigits(person.cpf),
    full_name: String(person.name || "").trim(),
    phone,
    phone2,
    whatsapp_phone: normalizeBrazilWhatsappPhone(phone, phone2),
    company_id: person.companyId ? Number(person.companyId) : null,
    company_name: String(company.companyName || person.companyName || "").trim() || `Empresa ${person.companyId}`,
    company_external_id: String(company.externalId || person.externalCompanyId || "").trim() || null,
    company_number: String(company.companyNumber || person.companyNumber || "").trim() || null,
    business_unit_id: person.businessUnitId ? Number(person.businessUnitId) : null,
    business_unit_name: String(person.businessUnitName || "").trim() || null,
    workplace_id: person.workplaceId ? Number(person.workplaceId) : null,
    workplace_external_id: String(person.externalWorkplaceId || workplace?.externalId || "").trim() || null,
    workplace_name: String(person.workplaceName || workplace?.name || "").trim() || null,
    client_name: String(workplace?.clientName || "").trim() || null,
    career_id: person.careerId ? Number(person.careerId) : null,
    career_external_id: String(person.externalCareerId || "").trim() || null,
    career_name: source.careerLookup.get(careerKey) || String(person.nameCareer || "").trim() || null,
    schedule_id: person.scheduleId ? Number(person.scheduleId) : null,
    schedule_external_id: String(person.externalScheduleId || "").trim() || null,
    schedule_name: source.scheduleLookup.get(scheduleKey) || String(person.nameSchedule || "").trim() || null,
    shift_id: person.shiftId ? Number(person.shiftId) : null,
    shift_external_id: String(person.externalShiftId || "").trim() || null,
    shift_name: source.shiftLookup.get(shiftKey) || null,
    rotation_id: person.rotationId ? Number(person.rotationId) : null,
    rotation_code: person.rotationCode ? Number(person.rotationCode) : null,
    person_situation_id: situationId,
    situation_label: getSituationLabel(situationId),
    admission_date: nextiDateTimeToIsoDate(person.admissionDate || person.registerDate),
    is_active: situationId === 1,
    sync_fingerprint: JSON.stringify({
      id: person.id,
      externalId: person.externalId,
      enrolment: person.enrolment,
      phone: person.phone,
      phone2: person.phone2,
      companyId: person.companyId,
      workplaceId: person.workplaceId,
      careerId: person.careerId,
      scheduleId: person.scheduleId,
      shiftId: person.shiftId,
      rotationCode: person.rotationCode,
      personSituationId: person.personSituationId,
    }),
    last_synced_at: source.syncedAt,
  };
}

function mapWorkplaceRow(
  groupKey: string,
  workplace: NextiWorkplace,
  companyOverride: Pick<
    WorkplaceInsert,
    "company_id" | "company_name" | "company_external_id" | "company_number"
  > | null,
  syncedAt: string,
): WorkplaceInsert {
  const nextiWorkplaceId = Number(workplace.id || 0);
  return {
    group_key: groupKey,
    nexti_workplace_id: nextiWorkplaceId,
    workplace_external_id: String(workplace.externalId || "").trim() || `NEXTI_WORKPLACE_${nextiWorkplaceId}`,
    name: String(workplace.name || "").trim(),
    client_name: String(workplace.clientName || "").trim() || null,
    service_name: String(workplace.service || "").trim() || null,
    company_id: companyOverride?.company_id ?? (workplace.companyId ? Number(workplace.companyId) : null),
    company_name: (companyOverride?.company_name ?? String(workplace.companyName || "").trim()) || null,
    company_external_id: (companyOverride?.company_external_id ?? String(workplace.externalCompanyId || "").trim()) || null,
    company_number: (companyOverride?.company_number ?? String(workplace.companyNumber || "").trim()) || null,
    business_unit_id: workplace.businessUnitId ? Number(workplace.businessUnitId) : null,
    business_unit_name: String(workplace.businessUnitName || "").trim() || null,
    is_active: workplace.active !== false && !String(workplace.finishDate || "").trim(),
    sync_fingerprint: JSON.stringify({
      id: workplace.id,
      externalId: workplace.externalId,
      name: workplace.name,
      clientName: workplace.clientName,
      service: workplace.service,
      active: workplace.active !== false,
      finishDate: workplace.finishDate,
    }),
    last_synced_at: syncedAt,
  };
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function upsertEmployees(rows: EmployeeInsert[]) {
  if (rows.length === 0) return;
  const supabase = createSupabaseAdminClient();
  for (const batch of chunk(rows, 250)) {
    const { error } = await supabase
      .from("employee_directory")
      .upsert(batch, { onConflict: "group_key,nexti_person_id", ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao sincronizar colaboradores: ${error.message}`);
  }
}

async function upsertWorkplaces(rows: WorkplaceInsert[]) {
  if (rows.length === 0) return;
  const supabase = createSupabaseAdminClient();
  for (const batch of chunk(rows, 250)) {
    const { error } = await supabase
      .from("workplace_directory")
      .upsert(batch, { onConflict: "group_key,nexti_workplace_id", ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao sincronizar postos: ${error.message}`);
  }
}

async function upsertShifts(rows: ShiftInsert[]) {
  if (rows.length === 0) return;
  const supabase = createSupabaseAdminClient();
  for (const batch of chunk(rows, 250)) {
    const { error } = await supabase
      .from("shift_directory")
      .upsert(batch, { onConflict: "nexti_shift_id", ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao sincronizar horarios: ${error.message}`);
  }
}

async function fetchDirectorySource(token: string, syncedAt: string): Promise<DirectorySource> {
  const [workplaces, persons, careers, schedules, shifts, companies] = await Promise.all([
    fetchAllPages<NextiWorkplace>("/workplaces/all", token, {}, 250),
    fetchAllPages<NextiPerson>("/persons/all", token, {}, 500),
    fetchAllPages<NextiNamedEntity>("/careers/all", token, {}, 250),
    fetchAllPages<NextiNamedEntity>("/schedules/all", token, {}, 250),
    fetchAllPages<NextiNamedEntity>("/shifts/all", token, {}, 250),
    fetchAllPages<NextiCompany>("/companies/all", token, {}, 250),
  ]);

  return {
    syncedAt,
    workplaces,
    persons,
    shifts,
    workplaceLookup: buildLookup(workplaces),
    companyLookup: buildLookup(companies),
    careerLookup: buildNameLookup(careers),
    scheduleLookup: buildNameLookup(schedules),
    shiftLookup: buildNameLookup(shifts),
  };
}

async function syncGroup(groupKey: string, config: NextiGroupConfig, source: DirectorySource) {
  const supabase = createSupabaseAdminClient();
  const groupWorkplaces = source.workplaces.filter((workplace) => matchesWorkplace(workplace, config));
  const allowedWorkplaceIds = new Set(groupWorkplaces.map((workplace) => Number(workplace.id)).filter(Number.isFinite));
  const allowedWorkplaceExternalIds = new Set(
    groupWorkplaces.map((workplace) => normalize(workplace.externalId)).filter(Boolean),
  );
  const employeeRows = source.persons
    .filter((person) => matchesPerson(person, config, allowedWorkplaceIds, allowedWorkplaceExternalIds))
    .map((person) => mapEmployeeRow(groupKey, person, source));
  const activeEmployeeRows = employeeRows.filter((row) => row.is_active);
  const shouldLimitWorkplacesToEmployees = Boolean(
    config.companyIds?.length || config.careerIds?.length || config.careerNameIncludes?.length,
  );
  const activeEmployeeWorkplaces = Array.from(
    new Map(
      activeEmployeeRows
        .map((row) => {
          const workplace =
            (typeof row.workplace_id === "number" ? source.workplaceLookup.byId.get(Number(row.workplace_id)) : null) ||
            source.workplaceLookup.byExternalId.get(normalize(row.workplace_external_id));
          return workplace?.id ? [Number(workplace.id), workplace] as const : null;
        })
        .filter((item): item is readonly [number, NextiWorkplace] => item !== null),
    ).values(),
  );
  const workplaceSource = shouldLimitWorkplacesToEmployees ? activeEmployeeWorkplaces : groupWorkplaces;
  const employeeCompanyByWorkplaceId = new Map(
    activeEmployeeRows
      .filter((row) => typeof row.workplace_id === "number")
      .map((row) => [
        Number(row.workplace_id),
        {
          company_id: row.company_id ?? null,
          company_name: row.company_name,
          company_external_id: row.company_external_id ?? null,
          company_number: row.company_number ?? null,
        },
      ]),
  );
  const workplaceRows = workplaceSource.map((workplace) =>
    mapWorkplaceRow(
      groupKey,
      workplace,
      workplace.id ? employeeCompanyByWorkplaceId.get(Number(workplace.id)) || null : null,
      source.syncedAt,
    ),
  );

  await upsertWorkplaces(workplaceRows);
  await upsertEmployees(employeeRows);
  await Promise.all([
    supabase.from("workplace_directory").update({ is_active: false }).eq("group_key", groupKey).lt("last_synced_at", source.syncedAt),
    supabase.from("employee_directory").update({ is_active: false }).eq("group_key", groupKey).lt("last_synced_at", source.syncedAt),
    supabase.from("nexti_sync_state").upsert(
      {
        sync_key: `directory:${groupKey}`,
        last_cursor_start: null,
        last_cursor_finish: null,
        last_success_at: source.syncedAt,
        last_error: null,
        metadata: {
          groupKey,
          syncedAt: source.syncedAt,
          totalPersons: employeeRows.length,
          activePersons: activeEmployeeRows.length,
          inactivePersons: employeeRows.length - activeEmployeeRows.length,
          totalWorkplaces: workplaceRows.length,
          activeWorkplaces: workplaceRows.filter((row) => row.is_active).length,
        } satisfies Json,
      },
      { onConflict: "sync_key", ignoreDuplicates: false },
    ),
  ]);

  return {
    groupKey,
    totalPersons: employeeRows.length,
    activePersons: activeEmployeeRows.length,
    totalWorkplaces: workplaceRows.length,
    activeWorkplaces: workplaceRows.filter((row) => row.is_active).length,
  };
}

export async function syncNextiDirectory(input: { group?: string | null; reason?: string } = {}) {
  const startedAt = new Date();
  const syncedAt = startedAt.toISOString();
  const supabase = createSupabaseAdminClient();

  try {
    const token = await fetchNextiToken();
    const source = await fetchDirectorySource(token, syncedAt);
    const shiftRows = source.shifts
      .map((shift) => mapShiftRow(shift, syncedAt))
      .filter((row): row is ShiftInsert => row !== null);
    await upsertShifts(shiftRows);
    const results = [];
    for (const [groupKey, config] of getRequestedGroups(input.group)) {
      results.push(await syncGroup(groupKey, config, source));
    }

    await supabase.from("nexti_sync_state").upsert(
      {
        sync_key: input.group ? `directory:full:${input.group}` : "directory:full",
        last_cursor_start: null,
        last_cursor_finish: null,
        last_success_at: new Date().toISOString(),
        last_error: null,
        metadata: {
          reason: input.reason || "manual",
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          groups: results,
          sourceTotals: {
            persons: source.persons.length,
            workplaces: source.workplaces.length,
            shifts: shiftRows.length,
          },
        } satisfies Json,
      },
      { onConflict: "sync_key", ignoreDuplicates: false },
    );

    return {
      ok: true,
      syncedAt,
      groups: results,
      sourceTotals: {
        persons: source.persons.length,
        workplaces: source.workplaces.length,
        shifts: shiftRows.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar diretorio Nexti.";
    await supabase.from("nexti_sync_state").upsert(
      {
        sync_key: input.group ? `directory:full:${input.group}` : "directory:full",
        last_cursor_start: null,
        last_cursor_finish: null,
        last_success_at: null,
        last_error: message,
        metadata: {
          reason: input.reason || "manual",
          failedAt: new Date().toISOString(),
        } satisfies Json,
      },
      { onConflict: "sync_key", ignoreDuplicates: false },
    );
    throw error;
  }
}

async function fetchPersonById(token: string, personId: number) {
  const payload = await nextiRequest<unknown>(`/persons/${personId}`, token);
  return unwrapValue<NextiPerson>(payload);
}

async function fetchLookupSourceForPerson(token: string, person: NextiPerson, syncedAt: string): Promise<DirectorySource> {
  const [workplaces, careers, schedules, shifts, companies] = await Promise.all([
    fetchAllPages<NextiWorkplace>("/workplaces/all", token, {}, 250),
    fetchAllPages<NextiNamedEntity>("/careers/all", token, {}, 250),
    fetchAllPages<NextiNamedEntity>("/schedules/all", token, {}, 250),
    fetchAllPages<NextiNamedEntity>("/shifts/all", token, {}, 250),
    fetchAllPages<NextiCompany>("/companies/all", token, {}, 250),
  ]);

  return {
    syncedAt,
    workplaces,
    persons: [person],
    shifts,
    workplaceLookup: buildLookup(workplaces),
    companyLookup: buildLookup(companies),
    careerLookup: buildNameLookup(careers),
    scheduleLookup: buildNameLookup(schedules),
    shiftLookup: buildNameLookup(shifts),
  };
}

export async function refreshNextiPersonById(personId: number) {
  const numericPersonId = Number(personId);
  if (!Number.isFinite(numericPersonId)) {
    return null;
  }

  const token = await fetchNextiToken();
  const person = await fetchPersonById(token, numericPersonId);
  if (!person?.id) {
    return null;
  }

  const groupKey = findGroupKeyByCompanyId(person.companyId);
  const supabase = createSupabaseAdminClient();
  const syncedAt = new Date().toISOString();

  if (!groupKey) {
    await supabase
      .from("employee_directory")
      .update({
        is_active: false,
        person_situation_id: Number(person.personSituationId || 4),
        situation_label: getSituationLabel(person.personSituationId || 4),
        last_synced_at: syncedAt,
      })
      .eq("nexti_person_id", numericPersonId);
    return null;
  }

  const source = await fetchLookupSourceForPerson(token, person, syncedAt);
  const employeeRow = mapEmployeeRow(groupKey, person, source);
  const workplace =
    (typeof employeeRow.workplace_id === "number" ? source.workplaceLookup.byId.get(employeeRow.workplace_id) : null) ||
    source.workplaceLookup.byExternalId.get(normalize(employeeRow.workplace_external_id));

  if (workplace) {
    await upsertWorkplaces([
      mapWorkplaceRow(
        groupKey,
        workplace,
        {
          company_id: employeeRow.company_id ?? null,
          company_name: employeeRow.company_name,
          company_external_id: employeeRow.company_external_id ?? null,
          company_number: employeeRow.company_number ?? null,
        },
        syncedAt,
      ),
    ]);
  }

  await upsertEmployees([employeeRow]);
  await Promise.all([
    supabase
      .from("employee_directory")
      .update({ is_active: false, last_synced_at: syncedAt })
      .eq("nexti_person_id", numericPersonId)
      .neq("group_key", groupKey),
    supabase.from("nexti_sync_state").upsert(
      {
        sync_key: `person:${numericPersonId}`,
        last_cursor_start: null,
        last_cursor_finish: null,
        last_success_at: syncedAt,
        last_error: null,
        metadata: {
          groupKey,
          syncedAt,
          isActive: employeeRow.is_active,
          companyId: employeeRow.company_id,
          workplaceId: employeeRow.workplace_id,
          careerId: employeeRow.career_id,
          scheduleId: employeeRow.schedule_id,
          shiftId: employeeRow.shift_id,
        } satisfies Json,
      },
      { onConflict: "sync_key", ignoreDuplicates: false },
    ),
  ]);

  return {
    groupKey,
    isActive: employeeRow.is_active,
    nextiPersonId: numericPersonId,
  };
}

export async function isDirectorySyncFresh(maxAgeMinutes = 10) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("nexti_sync_state")
    .select("last_success_at")
    .eq("sync_key", "directory:full")
    .maybeSingle();

  if (!data?.last_success_at) {
    return false;
  }

  const lastSuccessTime = new Date(data.last_success_at).getTime();
  return Number.isFinite(lastSuccessTime) && Date.now() - lastSuccessTime <= maxAgeMinutes * 60_000;
}
