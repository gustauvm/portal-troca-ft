import { createClient } from "@supabase/supabase-js";

const NEXTI_BASE_URL = process.env.NEXTI_API_BASE_URL || "https://api.nexti.com";

const GROUPS = {
  bombeiros: {
    businessUnitIds: [],
    companyIds: [11933],
  },
  servicos: {
    businessUnitIds: [],
    companyIds: [6098],
  },
  seguranca: {
    businessUnitIds: [],
    companyIds: [6097],
  },
  rbfacilities: {
    businessUnitIds: [],
    companyIds: [8028],
  },
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function includesAny(target, values = []) {
  const normalizedTarget = normalize(target);
  return values.some((value) => normalizedTarget.includes(normalize(value)));
}

function equalsAnyNumber(target, values = []) {
  const numericTarget = Number(target);
  return Number.isFinite(numericTarget) && values.includes(numericTarget);
}

function buildEnrolmentAliases(value) {
  const raw = String(value || "").trim();
  const aliases = new Set();
  const digits = normalizeDigits(raw);
  if (raw) aliases.add(raw.toUpperCase());
  if (digits) aliases.add(digits);
  if (raw.includes("-")) {
    const short = normalizeDigits(raw.split("-").pop());
    if (short) aliases.add(short);
  }
  return Array.from(aliases);
}

function nextiDateTimeToIsoDate(value) {
  const match = /^(\d{2})(\d{2})(\d{4})/.exec(String(value || "").trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

async function fetchNextiToken() {
  const credentials = Buffer.from(`${requireEnv("NEXTI_CLIENT_ID")}:${requireEnv("NEXTI_CLIENT_SECRET")}`).toString(
    "base64",
  );
  const response = await fetch(`${NEXTI_BASE_URL}/security/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Nao foi possivel autenticar na Nexti.");
  }
  return payload.access_token;
}

async function fetchAllPages(path, token, pageSize = 500) {
  const rows = [];
  for (let page = 0; page < 100; page += 1) {
    let response;
    let payload;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      response = await fetch(`${NEXTI_BASE_URL}${path}?page=${page}&size=${pageSize}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      payload = await response.json().catch(() => ({}));
      if (response.ok || response.status < 500 || attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
    if (!response.ok) {
      throw new Error(`${path} falhou: ${response.status} ${JSON.stringify(payload).slice(0, 180)}`);
    }
    const envelope = payload?.value && typeof payload.value === "object" ? payload.value : payload;
    const content = Array.isArray(envelope.content) ? envelope.content : [];
    rows.push(...content);
    if (envelope.last === true) break;
    if (typeof envelope.totalPages === "number" && page >= envelope.totalPages - 1) break;
    if (content.length === 0) break;
  }
  return rows;
}

function buildNameLookup(items) {
  const map = new Map();
  for (const item of items) {
    if (item.id) map.set(`id:${item.id}`, String(item.name || "").trim());
    if (item.externalId) map.set(`external:${item.externalId}`, String(item.name || "").trim());
  }
  return map;
}

function buildLookup(items) {
  const byId = new Map();
  const byExternalId = new Map();
  for (const item of items) {
    if (item.id) byId.set(Number(item.id), item);
    const externalId = normalize(item.externalId);
    if (externalId) byExternalId.set(externalId, item);
  }
  return { byId, byExternalId };
}

function requiresWorkplaceScope(config) {
  return Boolean(
    config.serviceIncludes?.length ||
      config.serviceExcludes?.length ||
      config.workplaceNameIncludes?.length ||
      config.workplaceExternalIds?.length ||
      config.companyNumbers?.length,
  );
}

function matchesWorkplace(workplace, config) {
  if (config.businessUnitIds?.length && equalsAnyNumber(workplace.businessUnitId, config.businessUnitIds)) {
    if (config.serviceIncludes?.length && !includesAny(workplace.service, config.serviceIncludes)) return false;
    if (config.serviceExcludes?.length && includesAny(workplace.service, config.serviceExcludes)) return false;
    return true;
  }
  if (config.companyIds?.length && equalsAnyNumber(workplace.companyId, config.companyIds)) return true;
  if (config.workplaceExternalIds?.length && config.workplaceExternalIds.some((id) => normalize(id) === normalize(workplace.externalId))) {
    return true;
  }
  if (config.companyNumbers?.length && config.companyNumbers.some((number) => normalize(number) === normalize(workplace.companyNumber))) {
    return true;
  }
  if (config.companyNameIncludes?.length && includesAny(workplace.companyName, config.companyNameIncludes)) return true;
  if (config.workplaceNameIncludes?.length && includesAny(workplace.name, config.workplaceNameIncludes)) return true;
  return false;
}

function matchesPerson(person, config, allowedWorkplaceIds, allowedWorkplaceExternalIds) {
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

function mapEmployeeRow(groupKey, person, context) {
  const nextiPersonId = Number(person.id || 0);
  const personExternalId = String(person.externalId || "").trim() || `NEXTI_PERSON_${nextiPersonId}`;
  const company = context.companyLookup.byId.get(Number(person.companyId)) || {};
  const workplace = person.workplaceId ? context.workplaceLookup.byId.get(Number(person.workplaceId)) : null;
  const careerKey = person.careerId ? `id:${person.careerId}` : `external:${person.externalCareerId || ""}`;
  const scheduleKey = person.scheduleId ? `id:${person.scheduleId}` : `external:${person.externalScheduleId || ""}`;
  const shiftKey = person.shiftId ? `id:${person.shiftId}` : `external:${person.externalShiftId || ""}`;
  const situationId = Number(person.personSituationId || 1);

  return {
    group_key: groupKey,
    nexti_person_id: nextiPersonId,
    person_external_id: personExternalId,
    enrolment: String(person.enrolment || "").trim(),
    enrolment_aliases: buildEnrolmentAliases(person.enrolment),
    cpf_digits: normalizeDigits(person.cpf),
    full_name: String(person.name || "").trim(),
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
    career_name: context.careerLookup.get(careerKey) || String(person.nameCareer || "").trim() || null,
    schedule_id: person.scheduleId ? Number(person.scheduleId) : null,
    schedule_external_id: String(person.externalScheduleId || "").trim() || null,
    schedule_name: context.scheduleLookup.get(scheduleKey) || String(person.nameSchedule || "").trim() || null,
    shift_id: person.shiftId ? Number(person.shiftId) : null,
    shift_external_id: String(person.externalShiftId || "").trim() || null,
    shift_name: context.shiftLookup.get(shiftKey) || null,
    rotation_id: person.rotationId ? Number(person.rotationId) : null,
    rotation_code: person.rotationCode ? Number(person.rotationCode) : null,
    person_situation_id: situationId,
    situation_label: situationId === 1 ? "ATIVO" : situationId === 3 ? "DEMITIDO" : `SITUACAO_${situationId}`,
    admission_date: nextiDateTimeToIsoDate(person.admissionDate || person.registerDate),
    is_active: situationId === 1,
    sync_fingerprint: JSON.stringify({
      id: person.id,
      externalId: person.externalId,
      enrolment: person.enrolment,
      companyId: person.companyId,
      workplaceId: person.workplaceId,
      careerId: person.careerId,
      scheduleId: person.scheduleId,
      shiftId: person.shiftId,
      rotationCode: person.rotationCode,
      personSituationId: person.personSituationId,
    }),
    last_synced_at: context.syncedAt,
  };
}

function mapWorkplaceRow(groupKey, workplace, companyOverride, syncedAt) {
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
    }),
    last_synced_at: syncedAt,
  };
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

async function upsertInChunks(supabase, table, rows, onConflict) {
  for (const batch of chunk(rows, 250)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao sincronizar ${table}: ${error.message}`);
  }
}

async function syncGroup(groupKey, config, source, supabase) {
  const groupWorkplaces = source.workplaces.filter((workplace) => matchesWorkplace(workplace, config));
  const allowedWorkplaceIds = new Set(groupWorkplaces.map((workplace) => Number(workplace.id)).filter(Number.isFinite));
  const allowedWorkplaceExternalIds = new Set(groupWorkplaces.map((workplace) => normalize(workplace.externalId)).filter(Boolean));
  const employeeRows = source.persons
    .filter((person) => matchesPerson(person, config, allowedWorkplaceIds, allowedWorkplaceExternalIds))
    .map((person) => mapEmployeeRow(groupKey, person, source));
  const activeEmployeeRows = employeeRows.filter((row) => row.is_active);
  const shouldLimitWorkplacesToEmployees = Boolean(config.companyIds?.length || config.careerIds?.length || config.careerNameIncludes?.length);
  const activeEmployeeWorkplaces = Array.from(
    new Map(
      activeEmployeeRows
        .map((row) => {
          const workplace =
            (typeof row.workplace_id === "number" ? source.workplaceLookup.byId.get(Number(row.workplace_id)) : null) ||
            source.workplaceLookup.byExternalId.get(normalize(row.workplace_external_id));
          return workplace?.id ? [Number(workplace.id), workplace] : null;
        })
        .filter(Boolean),
    ).values(),
  );
  const workplaceSource = shouldLimitWorkplacesToEmployees ? activeEmployeeWorkplaces : groupWorkplaces;
  const employeeCompanyByWorkplaceId = new Map(
    activeEmployeeRows
      .filter((row) => typeof row.workplace_id === "number")
      .map((row) => [
        Number(row.workplace_id),
        {
          company_id: row.company_id,
          company_name: row.company_name,
          company_external_id: row.company_external_id,
          company_number: row.company_number,
        },
      ]),
  );
  const workplaceRows = workplaceSource.map((workplace) =>
    mapWorkplaceRow(groupKey, workplace, workplace.id ? employeeCompanyByWorkplaceId.get(Number(workplace.id)) : null, source.syncedAt),
  );

  await upsertInChunks(supabase, "workplace_directory", workplaceRows, "group_key,nexti_workplace_id");
  await upsertInChunks(supabase, "employee_directory", employeeRows, "group_key,nexti_person_id");
  await Promise.all([
    supabase.from("workplace_directory").update({ is_active: false }).eq("group_key", groupKey).lt("last_synced_at", source.syncedAt),
    supabase.from("employee_directory").update({ is_active: false }).eq("group_key", groupKey).lt("last_synced_at", source.syncedAt),
    supabase.from("nexti_sync_state").upsert(
      {
        sync_key: `directory:${groupKey}`,
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
        },
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

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = await fetchNextiToken();
  const syncedAt = new Date().toISOString();
  const [workplaces, persons, careers, schedules, shifts, companies] = await Promise.all([
    fetchAllPages("/workplaces/all", token, 250),
    fetchAllPages("/persons/all", token, 500),
    fetchAllPages("/careers/all", token, 250),
    fetchAllPages("/schedules/all", token, 250),
    fetchAllPages("/shifts/all", token, 250),
    fetchAllPages("/companies/all", token, 250),
  ]);
  const source = {
    syncedAt,
    workplaces,
    persons,
    workplaceLookup: buildLookup(workplaces),
    companyLookup: buildLookup(companies),
    careerLookup: buildNameLookup(careers),
    scheduleLookup: buildNameLookup(schedules),
    shiftLookup: buildNameLookup(shifts),
  };
  const results = [];
  for (const [groupKey, config] of Object.entries(GROUPS)) {
    results.push(await syncGroup(groupKey, config, source, supabase));
  }
  console.table(results);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
