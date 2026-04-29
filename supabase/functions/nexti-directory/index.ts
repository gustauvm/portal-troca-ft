import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/http.ts";
import { requireGroupConfig, type GroupConfig } from "../_shared/group-config.ts";
import { fetchAllPages, fetchNextiToken } from "../_shared/nexti.ts";

type NextiWorkplace = {
  id?: number;
  externalId?: string;
  name?: string;
  clientName?: string;
  companyName?: string;
  companyNumber?: string;
  externalCompanyId?: string;
  active?: boolean;
  finishDate?: string;
};

type NextiPerson = {
  id?: number;
  externalId?: string;
  enrolment?: string;
  name?: string;
  workplaceId?: number;
  workplaceName?: string;
  externalWorkplaceId?: string;
  companyId?: number;
  externalCompanyId?: string;
  companyName?: string;
  scheduleId?: number;
  externalScheduleId?: string;
  rotationId?: number;
  rotationCode?: number;
  personSituationId?: number;
};

function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
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

function matchesWorkplace(workplace: NextiWorkplace, config: GroupConfig) {
  if (config.workplaceExternalIds?.length && equalsAny(workplace.externalId, config.workplaceExternalIds)) {
    return true;
  }

  if (config.externalCompanyIds?.length && equalsAny(workplace.externalCompanyId, config.externalCompanyIds)) {
    return true;
  }

  if (config.companyNumbers?.length && equalsAny(workplace.companyNumber, config.companyNumbers)) {
    return true;
  }

  if (config.companyNameIncludes?.length && includesAny(workplace.companyName, config.companyNameIncludes)) {
    return true;
  }

  if (config.workplaceNameIncludes?.length && includesAny(workplace.name, config.workplaceNameIncludes)) {
    return true;
  }

  return false;
}

function matchesPerson(
  person: NextiPerson,
  config: GroupConfig,
  allowedWorkplaceIds: Set<number>,
  allowedWorkplaceExternalIds: Set<string>
) {
  if (person.workplaceId && allowedWorkplaceIds.has(person.workplaceId)) {
    return true;
  }

  if (person.externalWorkplaceId && allowedWorkplaceExternalIds.has(normalize(person.externalWorkplaceId))) {
    return true;
  }

  if (config.externalCompanyIds?.length && equalsAny(person.externalCompanyId, config.externalCompanyIds)) {
    return true;
  }

  if (config.companyNameIncludes?.length && includesAny(person.companyName, config.companyNameIncludes)) {
    return true;
  }

  return false;
}

function mapWorkplace(workplace: NextiWorkplace) {
  return {
    id: workplace.id ?? null,
    externalId: workplace.externalId ?? "",
    name: workplace.name ?? "",
    clientName: workplace.clientName ?? "",
    companyName: workplace.companyName ?? "",
    companyNumber: workplace.companyNumber ?? "",
    active: workplace.active !== false
  };
}

function mapPerson(person: NextiPerson) {
  const situationId = Number(person.personSituationId || 1);
  let blockedReason = "";

  if (situationId === 2) blockedReason = "AUSENTE";
  else if (situationId === 3) blockedReason = "DEMITIDO";
  else if (situationId > 3) blockedReason = `SITUACAO_${situationId}`;

  return {
    id: person.id ?? null,
    externalId: person.externalId ?? "",
    enrolment: person.enrolment ?? "",
    name: person.name ?? "",
    workplaceId: person.workplaceId ?? null,
    workplaceName: person.workplaceName ?? "",
    workplaceExternalId: person.externalWorkplaceId ?? "",
    companyId: person.companyId ?? null,
    externalCompanyId: person.externalCompanyId ?? "",
    companyName: person.companyName ?? "",
    scheduleId: person.scheduleId ?? null,
    externalScheduleId: person.externalScheduleId ?? "",
    rotationId: person.rotationId ?? null,
    rotationCode: person.rotationCode ?? null,
    personSituationId: situationId,
    blocked: situationId !== 1,
    blockedReason
  };
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
    const group = url.searchParams.get("group");
    if (!group) {
      return errorResponse("Parametro group e obrigatorio.", 400);
    }

    const config = requireGroupConfig(group);
    const token = await fetchNextiToken();

    const workplaces = await fetchAllPages<NextiWorkplace>(
      "/workplaces/all",
      token,
      {
        active: true,
        filter: config.workplaceFilter
      },
      200
    );

    const filteredWorkplaces = workplaces
      .filter((workplace) => matchesWorkplace(workplace, config))
      .map(mapWorkplace)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

    const allowedWorkplaceIds = new Set(
      filteredWorkplaces
        .map((workplace) => workplace.id)
        .filter((value): value is number => typeof value === "number")
    );

    const allowedWorkplaceExternalIds = new Set(
      filteredWorkplaces
        .map((workplace) => normalize(workplace.externalId))
        .filter(Boolean)
    );

    const persons = await fetchAllPages<NextiPerson>(
      "/persons/all",
      token,
      {
        filter: config.personFilter
      },
      500
    );

    const filteredPersons = persons
      .filter((person) => matchesPerson(person, config, allowedWorkplaceIds, allowedWorkplaceExternalIds))
      .map(mapPerson)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

    return jsonResponse({
      group,
      loadedAt: new Date().toISOString(),
      metadata: {
        workplaceCount: filteredWorkplaces.length,
        personCount: filteredPersons.length,
        filtersApplied: {
          companyNameIncludes: config.companyNameIncludes || [],
          externalCompanyIds: config.externalCompanyIds || [],
          workplaceExternalIds: config.workplaceExternalIds || []
        }
      },
      workplaces: filteredWorkplaces,
      persons: filteredPersons
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "Falha ao consultar a Nexti.", 500);
  }
});
