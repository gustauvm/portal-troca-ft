import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse, readJsonBody } from "../_shared/http.ts";
import { getNextiBaseUrl, fetchNextiToken } from "../_shared/nexti.ts";
import { formatNextiDate } from "../_shared/portal-nexti.ts";

type ConflictCheckRequest = {
  requestType?: "swap" | "ft";
  requester?: {
    personExternalId?: string;
    fullName?: string;
  };
  substitute?: {
    personExternalId?: string;
    fullName?: string;
  } | null;
  workplaceExternalId?: string | null;
  workplaceName?: string | null;
  requestDate?: string;
  coverageDate?: string | null;
  reason?: string;
};

type NextiShift = {
  id?: number;
  externalId?: string;
  name?: string;
  active?: boolean;
};

const NON_WORKING_SHIFT_PATTERNS = [
  "FOLGA",
  "DESCANSO",
  "DSR",
  "OFF",
  "FERIAS",
  "FÉRIAS",
  "ATESTADO",
  "AFAST",
  "LICEN",
  "AUSEN",
];

function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function requireIsoDate(value: string | null | undefined, field: string) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Data invalida em ${field}.`);
  }
  return normalized;
}

function requireExternalId(value: string | null | undefined, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Campo obrigatorio ausente: ${field}.`);
  }
  return normalized;
}

function classifyShift(shift: NextiShift | null) {
  if (!shift) {
    return {
      worksOnDate: false,
      reason: "Nenhum horario associado na data.",
    };
  }

  const shiftName = normalize(shift.name);
  if (NON_WORKING_SHIFT_PATTERNS.some((pattern) => shiftName.includes(pattern))) {
    return {
      worksOnDate: false,
      reason: `Horario classificado como folga/afastamento (${shift.name || "sem nome"}).`,
    };
  }

  return {
    worksOnDate: true,
    reason: `Horario ativo na data (${shift.name || "sem nome"}).`,
  };
}

async function fetchShiftForPersonOnDate(token: string, personExternalId: string, referenceDate: string) {
  const path = `${getNextiBaseUrl()}/shifts/personExternalId/${encodeURIComponent(personExternalId)}/referenceDate/${formatNextiDate(referenceDate)}`;
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Falha ao consultar horario na Nexti: ${response.status}`);
  }

  const value =
    payload && typeof payload === "object" && "value" in payload
      ? payload.value
      : payload;

  if (!value || typeof value !== "object") {
    return null;
  }

  return value as NextiShift;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const input = await readJsonBody<ConflictCheckRequest>(request);
    const requestType = input.requestType;
    if (requestType !== "swap" && requestType !== "ft") {
      return errorResponse("Tipo de solicitacao invalido.", 400);
    }

    const requestDate = requireIsoDate(input.requestDate, "requestDate");
    const coverageDate = requestType === "swap" ? requireIsoDate(input.coverageDate, "coverageDate") : null;
    const requesterExternalId = requireExternalId(input.requester?.personExternalId, "requester.personExternalId");
    const substituteExternalId =
      requestType === "swap"
        ? requireExternalId(input.substitute?.personExternalId, "substitute.personExternalId")
        : null;

    const token = await fetchNextiToken();

    const shiftLookups = await Promise.all([
      fetchShiftForPersonOnDate(token, requesterExternalId, requestDate),
      requestType === "swap" && coverageDate
        ? fetchShiftForPersonOnDate(token, requesterExternalId, coverageDate)
        : Promise.resolve(null),
      requestType === "swap"
        ? fetchShiftForPersonOnDate(token, substituteExternalId as string, requestDate)
        : Promise.resolve(null),
      requestType === "swap" && coverageDate
        ? fetchShiftForPersonOnDate(token, substituteExternalId as string, coverageDate)
        : Promise.resolve(null),
    ]);

    const requesterPrimary = classifyShift(shiftLookups[0]);
    const requesterCoverage = classifyShift(shiftLookups[1]);
    const substitutePrimary = classifyShift(shiftLookups[2]);
    const substituteCoverage = classifyShift(shiftLookups[3]);

    const issues: string[] = [];

    if (requestType === "swap") {
      if (!requesterPrimary.worksOnDate) {
        issues.push("A data principal nao parece ser um dia de trabalho do solicitante na Nexti.");
      }

      if (substitutePrimary.worksOnDate) {
        issues.push("O colega informado aparenta ja estar escalado na data principal.");
      }

      if (requesterCoverage.worksOnDate) {
        issues.push("A data de compensacao aparenta ja ser um dia de trabalho do solicitante.");
      }

      if (!substituteCoverage.worksOnDate) {
        issues.push("O colega informado nao aparenta estar escalado na data de compensacao.");
      }
    } else if (requesterPrimary.worksOnDate) {
      issues.push("A data informada para FT aparenta ja ser um dia de trabalho do colaborador.");
    }

    return jsonResponse({
      ok: issues.length === 0,
      issues,
      summary: {
        requestType,
        requestDate,
        coverageDate,
        workplaceExternalId: input.workplaceExternalId || null,
        workplaceName: input.workplaceName || null,
        requester: {
          fullName: input.requester?.fullName || null,
          personExternalId: requesterExternalId,
          requestDateShift: shiftLookups[0],
          requestDateClassification: requesterPrimary,
          coverageDateShift: shiftLookups[1],
          coverageDateClassification: requesterCoverage,
        },
        substitute:
          requestType === "swap"
            ? {
                fullName: input.substitute?.fullName || null,
                personExternalId: substituteExternalId,
                requestDateShift: shiftLookups[2],
                requestDateClassification: substitutePrimary,
                coverageDateShift: shiftLookups[3],
                coverageDateClassification: substituteCoverage,
              }
            : null,
      },
      nextiPayload: {
        checkedAt: new Date().toISOString(),
        validationMode: "shift_reference_date",
      },
    });
  } catch (error) {
    console.error(error);
    return errorResponse(
      error instanceof Error ? error.message : "Falha ao validar conflito de escala na Nexti.",
      500,
    );
  }
});
