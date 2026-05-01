import { requireGroupConfig, type GroupConfig } from "./group-config.ts";

export type NextiWorkplace = {
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

export type NextiPerson = {
  id?: number;
  externalId?: string;
  enrolment?: string;
  name?: string;
  cpf?: string;
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

export type NextiCareer = {
  id?: number;
  externalId?: string;
  name?: string;
};

export type NextiCompany = {
  id?: number;
  externalId?: string;
  companyName?: string;
  companyNumber?: string;
  fantasyName?: string;
  active?: boolean;
};

export type NextiSchedule = {
  id?: number;
  externalId?: string;
  name?: string;
};

export type NextiShift = {
  id?: number;
  externalId?: string;
  name?: string;
};

export function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function buildEnrolmentAliases(value: unknown) {
  const raw = String(value || "").trim();
  const aliases = new Set<string>();
  const digits = normalizeDigits(raw);
  if (raw) aliases.add(raw.toUpperCase());
  if (digits) aliases.add(digits);
  if (raw.includes("-")) {
    const short = normalizeDigits(raw.split("-").pop());
    if (short) aliases.add(short);
  }
  return Array.from(aliases);
}

export function nextiDateTimeToIsoDate(value: unknown) {
  const normalized = String(value || "").trim();
  const match = /^(\d{2})(\d{2})(\d{4})/.exec(normalized);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function includesAny(target: unknown, values?: string[]) {
  if (!values || !values.length) return false;
  const normalizedTarget = normalize(target);
  return values.some((value) => normalizedTarget.includes(normalize(value)));
}

function equalsAny(target: unknown, values?: string[]) {
  if (!values || !values.length) return false;
  const normalizedTarget = normalize(target);
  return values.some((value) => normalizedTarget === normalize(value));
}

function equalsAnyNumber(target: unknown, values?: number[]) {
  if (!values || !values.length) return false;
  const numericTarget = Number(target);
  return Number.isFinite(numericTarget) && values.includes(numericTarget);
}

function requiresWorkplaceScope(config: GroupConfig) {
  return Boolean(
    config.serviceIncludes?.length ||
      config.serviceExcludes?.length ||
      config.workplaceNameIncludes?.length ||
      config.workplaceExternalIds?.length ||
      config.companyNumbers?.length
  );
}

export function matchesWorkplace(workplace: NextiWorkplace, config: GroupConfig) {
  if (config.businessUnitIds?.length && equalsAnyNumber(workplace.businessUnitId, config.businessUnitIds)) {
    if (config.serviceIncludes?.length && !includesAny(workplace.service, config.serviceIncludes)) {
      return false;
    }
    if (config.serviceExcludes?.length && includesAny(workplace.service, config.serviceExcludes)) {
      return false;
    }
    return true;
  }

  if (config.companyIds?.length && equalsAnyNumber(workplace.companyId, config.companyIds)) {
    if (config.serviceIncludes?.length && !includesAny(workplace.service, config.serviceIncludes)) {
      return false;
    }
    if (config.serviceExcludes?.length && includesAny(workplace.service, config.serviceExcludes)) {
      return false;
    }
    return true;
  }

  if (config.workplaceExternalIds?.length && equalsAny(workplace.externalId, config.workplaceExternalIds)) return true;
  if (config.externalCompanyIds?.length && equalsAny(workplace.externalCompanyId, config.externalCompanyIds)) return true;
  if (config.companyNumbers?.length && equalsAny(workplace.companyNumber, config.companyNumbers)) return true;
  if (config.companyNameIncludes?.length && includesAny(workplace.companyName, config.companyNameIncludes)) return true;
  if (config.workplaceNameIncludes?.length && includesAny(workplace.name, config.workplaceNameIncludes)) return true;

  return false;
}

export function matchesPerson(
  person: NextiPerson,
  config: GroupConfig,
  allowedWorkplaceIds: Set<number>,
  allowedWorkplaceExternalIds: Set<string>
) {
  const useWorkplaceScope = requiresWorkplaceScope(config) && (allowedWorkplaceIds.size > 0 || allowedWorkplaceExternalIds.size > 0);
  const matchesConfigScope = (() => {
    if (config.businessUnitIds?.length && !equalsAnyNumber(person.businessUnitId, config.businessUnitIds)) return false;
    if (config.companyIds?.length && !equalsAnyNumber(person.companyId, config.companyIds)) return false;
    if (config.externalCompanyIds?.length && !equalsAny(person.externalCompanyId, config.externalCompanyIds)) return false;
    if (config.companyNameIncludes?.length && !includesAny(person.companyName, config.companyNameIncludes)) return false;
    if (config.careerIds?.length && !equalsAnyNumber(person.careerId, config.careerIds)) return false;
    if (config.careerNameIncludes?.length && !includesAny(person.nameCareer, config.careerNameIncludes)) return false;
    return true;
  })();

  if (!matchesConfigScope) return false;
  if (!useWorkplaceScope) return true;

  if (person.workplaceId && allowedWorkplaceIds.has(person.workplaceId)) return true;
  if (person.externalWorkplaceId && allowedWorkplaceExternalIds.has(normalize(person.externalWorkplaceId))) return true;
  return false;
}

export function getSituationLabel(personSituationId?: number | null) {
  const value = Number(personSituationId || 1);
  if (value === 1) return "ATIVO";
  if (value === 2) return "AUSENTE";
  if (value === 3) return "DEMITIDO";
  if (value === 4) return "INATIVO";
  return `SITUACAO_${value}`;
}

export function mapWorkplaceRow(groupKey: string, workplace: NextiWorkplace) {
  const nextiWorkplaceId = Number(workplace.id || 0);
  const workplaceExternalId = String(workplace.externalId || "").trim() || `NEXTI_WORKPLACE_${nextiWorkplaceId}`;

  return {
    group_key: groupKey,
    nexti_workplace_id: nextiWorkplaceId,
    workplace_external_id: workplaceExternalId,
    name: String(workplace.name || "").trim(),
    client_name: String(workplace.clientName || "").trim() || null,
    service_name: String(workplace.service || "").trim() || null,
    company_id: workplace.companyId ? Number(workplace.companyId) : null,
    company_name: String(workplace.companyName || "").trim() || null,
    company_external_id: String(workplace.externalCompanyId || "").trim() || null,
    company_number: String(workplace.companyNumber || "").trim() || null,
    business_unit_id: workplace.businessUnitId ? Number(workplace.businessUnitId) : null,
    business_unit_name: String(workplace.businessUnitName || "").trim() || null,
    is_active: workplace.active !== false,
    sync_fingerprint: JSON.stringify({
      id: workplace.id,
      externalId: workplace.externalId,
      name: workplace.name,
      clientName: workplace.clientName,
      service: workplace.service,
      active: workplace.active !== false,
    }),
    last_synced_at: new Date().toISOString(),
  };
}

export function mapEmployeeRow(
  groupKey: string,
  person: NextiPerson,
  careerNameLookup: Map<string, string>,
  scheduleNameLookup: Map<string, string>,
  shiftNameLookup: Map<string, string>
) {
  const nextiPersonId = Number(person.id || 0);
  const personExternalId = String(person.externalId || "").trim() || `NEXTI_PERSON_${nextiPersonId}`;
  const careerKey = person.careerId ? `id:${person.careerId}` : `external:${person.externalCareerId || ""}`;
  const scheduleKey = person.scheduleId ? `id:${person.scheduleId}` : `external:${person.externalScheduleId || ""}`;
  const shiftKey = person.shiftId ? `id:${person.shiftId}` : `external:${person.externalShiftId || ""}`;
  const situationLabel = getSituationLabel(person.personSituationId);
  const admissionDate = nextiDateTimeToIsoDate(person.admissionDate || person.registerDate);

  return {
    group_key: groupKey,
    nexti_person_id: nextiPersonId,
    person_external_id: personExternalId,
    enrolment: String(person.enrolment || "").trim(),
    enrolment_aliases: buildEnrolmentAliases(person.enrolment),
    cpf_digits: normalizeDigits(person.cpf),
    full_name: String(person.name || "").trim(),
    company_id: person.companyId ? Number(person.companyId) : null,
    company_name: String(person.companyName || "").trim(),
    company_external_id: String(person.externalCompanyId || "").trim() || null,
    company_number: String(person.companyNumber || "").trim() || null,
    business_unit_id: person.businessUnitId ? Number(person.businessUnitId) : null,
    business_unit_name: String(person.businessUnitName || "").trim() || null,
    workplace_id: person.workplaceId ? Number(person.workplaceId) : null,
    workplace_external_id: String(person.externalWorkplaceId || "").trim() || null,
    workplace_name: String(person.workplaceName || "").trim() || null,
    client_name: null,
    career_id: person.careerId ? Number(person.careerId) : null,
    career_external_id: String(person.externalCareerId || "").trim() || null,
    career_name: careerNameLookup.get(careerKey) || String(person.nameCareer || "").trim() || null,
    schedule_id: person.scheduleId ? Number(person.scheduleId) : null,
    schedule_external_id: String(person.externalScheduleId || "").trim() || null,
    schedule_name: scheduleNameLookup.get(scheduleKey) || String(person.nameSchedule || "").trim() || null,
    shift_id: person.shiftId ? Number(person.shiftId) : null,
    shift_external_id: String(person.externalShiftId || "").trim() || null,
    shift_name: shiftNameLookup.get(shiftKey) || null,
    rotation_id: person.rotationId ? Number(person.rotationId) : null,
    rotation_code: person.rotationCode ? Number(person.rotationCode) : null,
    person_situation_id: Number(person.personSituationId || 1),
    situation_label: situationLabel,
    admission_date: admissionDate,
    is_active: Number(person.personSituationId || 1) === 1,
    sync_fingerprint: JSON.stringify({
      id: person.id,
      externalId: person.externalId,
      enrolment: person.enrolment,
      companyId: person.companyId,
      companyName: person.companyName,
      workplaceId: person.workplaceId,
      workplaceName: person.workplaceName,
      careerId: person.careerId,
      scheduleId: person.scheduleId,
      shiftId: person.shiftId,
      rotationCode: person.rotationCode,
      personSituationId: person.personSituationId,
    }),
    last_synced_at: new Date().toISOString(),
  };
}

export function getRequestedGroups(group?: string | null) {
  if (group) {
    return [[group, requireGroupConfig(group)] as const];
  }

  const parsedConfig = (() => {
    try {
      return JSON.parse(Deno.env.get("NEXTI_GROUP_CONFIG_JSON") || "{}");
    } catch {
      return {};
    }
  })() as Record<string, unknown>;

  const keys = Array.from(
    new Set([
      "bombeiros",
      "servicos",
      "seguranca",
      "rbfacilities",
      ...Object.keys(parsedConfig),
    ]),
  );

  return keys.map((key) => [key, requireGroupConfig(key)] as const);
}

export function buildLookupMap<T extends { id?: number; externalId?: string; name?: string }>(items: T[]) {
  const map = new Map<string, string>();

  items.forEach((item) => {
    if (item.id) map.set(`id:${item.id}`, String(item.name || "").trim());
    if (item.externalId) map.set(`external:${item.externalId}`, String(item.name || "").trim());
  });

  return map;
}
