import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, readJsonBody } from "../_shared/http.ts";
import { fetchAllPages, fetchNextiToken } from "../_shared/nexti.ts";
import { createServiceClient } from "../_shared/portal-db.ts";
import {
  buildLookupMap,
  getRequestedGroups,
  mapEmployeeRow,
  mapWorkplaceRow,
  matchesPerson,
  matchesWorkplace,
  normalize,
  type NextiCareer,
  type NextiCompany,
  type NextiPerson,
  type NextiSchedule,
  type NextiShift,
  type NextiWorkplace,
} from "../_shared/portal-read-model.ts";

type DirectorySyncRequest = {
  group?: string | null;
  dryRun?: boolean;
};

type MutableRecord = Record<string, unknown>;

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function upsertInChunks(
  table: "employee_directory" | "workplace_directory",
  rows: MutableRecord[],
  onConflict: string,
) {
  if (!rows.length) return;

  const supabase = createServiceClient();
  for (const batch of chunk(rows, 250)) {
    const { error } = await supabase.from(table).upsert(batch, {
      onConflict,
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`Falha ao sincronizar ${table}: ${error.message}`);
    }
  }
}

function buildWorkplaceLookup(workplaces: NextiWorkplace[]) {
  const byId = new Map<number, NextiWorkplace>();
  const byExternalId = new Map<string, NextiWorkplace>();

  workplaces.forEach((workplace) => {
    if (workplace.id) {
      byId.set(Number(workplace.id), workplace);
    }

    const externalId = normalize(workplace.externalId);
    if (externalId) {
      byExternalId.set(externalId, workplace);
    }
  });

  return {
    byId,
    byExternalId,
  };
}

function buildCompanyLookup(companies: NextiCompany[]) {
  const byId = new Map<number, NextiCompany>();
  const byExternalId = new Map<string, NextiCompany>();

  companies.forEach((company) => {
    if (company.id) {
      byId.set(Number(company.id), company);
    }

    const externalId = normalize(company.externalId);
    if (externalId) {
      byExternalId.set(externalId, company);
    }
  });

  return {
    byId,
    byExternalId,
  };
}

function resolveWorkplaceForPerson(person: NextiPerson, lookup: ReturnType<typeof buildWorkplaceLookup>) {
  if (person.workplaceId && lookup.byId.has(Number(person.workplaceId))) {
    return lookup.byId.get(Number(person.workplaceId)) || null;
  }

  const externalWorkplaceId = normalize(person.externalWorkplaceId);
  if (externalWorkplaceId && lookup.byExternalId.has(externalWorkplaceId)) {
    return lookup.byExternalId.get(externalWorkplaceId) || null;
  }

  return null;
}

function buildSyncMetadata(input: {
  groupKey: string;
  syncedAt: string;
  personRows: MutableRecord[];
  workplaceRows: MutableRecord[];
}) {
  const activePersons = input.personRows.filter((row) => row.is_active === true).length;
  const inactivePersons = input.personRows.length - activePersons;
  const activeWorkplaces = input.workplaceRows.filter((row) => row.is_active === true).length;
  const inactiveWorkplaces = input.workplaceRows.length - activeWorkplaces;

  return {
    groupKey: input.groupKey,
    syncedAt: input.syncedAt,
    activePersons,
    inactivePersons,
    activeWorkplaces,
    inactiveWorkplaces,
    totalPersons: input.personRows.length,
    totalWorkplaces: input.workplaceRows.length,
  };
}

async function persistSyncState(groupKey: string, metadata: Record<string, unknown>, errorMessage?: string | null) {
  const supabase = createServiceClient();
  const payload = {
    sync_key: `directory:${groupKey}`,
    last_success_at: errorMessage ? null : new Date().toISOString(),
    last_error: errorMessage || null,
    metadata,
  };

  const { error } = await supabase.from("nexti_sync_state").upsert(payload, {
    onConflict: "sync_key",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Falha ao registrar o estado de sincronizacao: ${error.message}`);
  }
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const input = await readJsonBody<DirectorySyncRequest>(request);
  const dryRun = input.dryRun === true;

  try {
    const requestedGroups = getRequestedGroups(input.group);
    const token = await fetchNextiToken();
    const syncedAt = new Date().toISOString();

    const [workplaces, persons, careers, schedules, shifts, companies] = await Promise.all([
      fetchAllPages<NextiWorkplace>("/workplaces/all", token, {}, 250),
      fetchAllPages<NextiPerson>("/persons/all", token, {}, 500),
      fetchAllPages<NextiCareer>("/careers/all", token, {}, 250),
      fetchAllPages<NextiSchedule>("/schedules/all", token, {}, 250),
      fetchAllPages<NextiShift>("/shifts/all", token, {}, 250),
      fetchAllPages<NextiCompany>("/companies/all", token, {}, 250),
    ]);

    const careerLookup = buildLookupMap(careers);
    const scheduleLookup = buildLookupMap(schedules);
    const shiftLookup = buildLookupMap(shifts);
    const companyLookup = buildCompanyLookup(companies);
    const workplacesLookup = buildWorkplaceLookup(workplaces);
    const supabase = dryRun ? null : createServiceClient();

    const results = [];

    for (const [groupKey, config] of requestedGroups) {
      try {
        const groupWorkplaces = workplaces
          .filter((workplace) => matchesWorkplace(workplace, config))
          .map((workplace) => ({
            ...workplace,
            active: workplace.active !== false && !String(workplace.finishDate || "").trim(),
          }));

        const allowedWorkplaceIds = new Set(
          groupWorkplaces
            .map((workplace) => workplace.id)
            .filter((value): value is number => typeof value === "number"),
        );

        const allowedWorkplaceExternalIds = new Set(
          groupWorkplaces
            .map((workplace) => normalize(workplace.externalId))
            .filter(Boolean),
        );

        const employeeRows = persons
          .filter((person) => matchesPerson(person, config, allowedWorkplaceIds, allowedWorkplaceExternalIds))
          .map((person) => {
            const relatedWorkplace = resolveWorkplaceForPerson(person, workplacesLookup);
            const enrichedPerson: NextiPerson = {
              ...person,
              companyName:
                String(companyLookup.byId.get(Number(person.companyId))?.companyName || "").trim() ||
                String(person.companyName || "").trim() ||
                String(relatedWorkplace?.companyName || "").trim() ||
                (person.companyId ? `Empresa ${person.companyId}` : "Empresa nao informada"),
              companyNumber:
                String(companyLookup.byId.get(Number(person.companyId))?.companyNumber || "").trim() ||
                String(person.companyNumber || "").trim() ||
                String(relatedWorkplace?.companyNumber || "").trim() ||
                "",
              externalCompanyId:
                String(companyLookup.byId.get(Number(person.companyId))?.externalId || "").trim() ||
                String(person.externalCompanyId || "").trim() ||
                String(relatedWorkplace?.externalCompanyId || "").trim() ||
                "",
              businessUnitName:
                String(person.businessUnitName || "").trim() ||
                String(relatedWorkplace?.businessUnitName || "").trim() ||
                "",
              workplaceName:
                String(person.workplaceName || "").trim() ||
                String(relatedWorkplace?.name || "").trim() ||
                "",
              externalWorkplaceId:
                String(person.externalWorkplaceId || "").trim() ||
                String(relatedWorkplace?.externalId || "").trim() ||
                "",
            };

            const row = mapEmployeeRow(groupKey, enrichedPerson, careerLookup, scheduleLookup, shiftLookup) as MutableRecord;
            row.client_name = String(relatedWorkplace?.clientName || "").trim() || null;
            row.company_name = String(row.company_name || "").trim() || "Empresa nao informada";
            row.company_number = String(row.company_number || "").trim() || null;
            row.workplace_name = String(row.workplace_name || "").trim() || null;
            row.workplace_external_id = String(row.workplace_external_id || "").trim() || null;
            row.last_synced_at = syncedAt;
            return row;
          });

        const activeEmployeeRows = employeeRows.filter((row) => row.is_active === true);
        const employeeWorkplaceIds = new Set(
          activeEmployeeRows
            .map((row) => row.workplace_id)
            .filter((value): value is number => typeof value === "number"),
        );
        const employeeWorkplaceExternalIds = new Set(
          activeEmployeeRows
            .map((row) => normalize(row.workplace_external_id))
            .filter(Boolean),
        );
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
        const employeeCompanyByWorkplaceExternalId = new Map(
          activeEmployeeRows
            .map((row) => [
              normalize(row.workplace_external_id),
              {
                company_id: row.company_id,
                company_name: row.company_name,
                company_external_id: row.company_external_id,
                company_number: row.company_number,
              },
            ])
            .filter(([key]) => Boolean(key)),
        );
        const shouldLimitWorkplacesToEmployees = Boolean(config.companyIds?.length || config.careerIds?.length || config.careerNameIncludes?.length);
        const activeEmployeeWorkplaces = Array.from(
          new Map(
            activeEmployeeRows
              .map((row) => {
                const byId =
                  typeof row.workplace_id === "number"
                    ? workplacesLookup.byId.get(Number(row.workplace_id))
                    : null;
                const byExternalId = workplacesLookup.byExternalId.get(normalize(row.workplace_external_id));
                const workplace = byId || byExternalId;
                return workplace?.id ? [Number(workplace.id), workplace] as const : null;
              })
              .filter((entry): entry is readonly [number, NextiWorkplace] => Boolean(entry)),
          ).values(),
        );
        const workplaceSource = shouldLimitWorkplacesToEmployees ? activeEmployeeWorkplaces : groupWorkplaces;

        const workplaceRows = workplaceSource
          .filter((workplace) => {
            if (!shouldLimitWorkplacesToEmployees) return true;
            if (workplace.id && employeeWorkplaceIds.has(Number(workplace.id))) return true;
            return employeeWorkplaceExternalIds.has(normalize(workplace.externalId));
          })
          .map((workplace) => {
            const row = mapWorkplaceRow(groupKey, workplace) as MutableRecord;
            const employeeCompany =
              (workplace.id ? employeeCompanyByWorkplaceId.get(Number(workplace.id)) : null) ||
              employeeCompanyByWorkplaceExternalId.get(normalize(workplace.externalId));
            if (employeeCompany) {
              row.company_id = employeeCompany.company_id;
              row.company_name = employeeCompany.company_name;
              row.company_external_id = employeeCompany.company_external_id;
              row.company_number = employeeCompany.company_number;
            }
            row.last_synced_at = syncedAt;
            return row;
          });

        if (!dryRun && supabase) {
          await upsertInChunks("workplace_directory", workplaceRows, "group_key,nexti_workplace_id");
          await upsertInChunks("employee_directory", employeeRows, "group_key,nexti_person_id");

          await Promise.all([
            supabase
              .from("workplace_directory")
              .update({ is_active: false })
              .eq("group_key", groupKey)
              .lt("last_synced_at", syncedAt),
            supabase
              .from("employee_directory")
              .update({ is_active: false })
              .eq("group_key", groupKey)
              .lt("last_synced_at", syncedAt),
          ]);
        }

        const metadata = buildSyncMetadata({
          groupKey,
          syncedAt,
          personRows: employeeRows,
          workplaceRows: workplaceRows,
        });

        if (!dryRun) {
          await persistSyncState(groupKey, metadata, null);
        }

        results.push({
          ok: true,
          ...metadata,
        });
      } catch (groupError) {
        const message = groupError instanceof Error ? groupError.message : "Falha no grupo.";
        if (!dryRun) {
          await persistSyncState(groupKey, { groupKey, syncedAt }, message);
        }

        results.push({
          ok: false,
          groupKey,
          syncedAt,
          error: message,
        });
      }
    }

    const failedGroups = results.filter((result) => result.ok === false);
    if (failedGroups.length > 0) {
      return jsonResponse(
        {
          ok: false,
          dryRun,
          syncedAt,
          results,
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      dryRun,
      syncedAt,
      results,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(
      error instanceof Error ? error.message : "Falha ao sincronizar o diretorio da Nexti.",
      500,
    );
  }
});
