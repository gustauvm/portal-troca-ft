import "server-only";

type ConflictCheckPayload = {
  requestType: "swap" | "ft";
  requester: {
    personExternalId: string;
    fullName: string;
  };
  substitute?: {
    personExternalId: string;
    fullName: string;
  } | null;
  requestDate: string;
  coverageDate?: string | null;
  workplaceExternalId?: string | null;
  workplaceName?: string | null;
  reason: string;
};

type NextiShift = {
  id?: number;
  externalId?: string;
  name?: string;
  active?: boolean;
};

const NEXTI_BASE_URL = (process.env.NEXTI_API_BASE_URL || "https://api.nexti.com").replace(/\/$/, "");
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

function hasRealExternalId(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && !normalized.startsWith("NEXTI_PERSON_"));
}

function formatNextiDate(date: string, time = "000000") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) {
    throw new Error(`Data invalida para a Nexti: ${date}`);
  }
  const [, year, month, day] = match;
  return `${day}${month}${year}${time}`;
}

async function fetchNextiToken() {
  const clientId = process.env.NEXTI_CLIENT_ID;
  const clientSecret = process.env.NEXTI_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais da Nexti nao configuradas no servidor.");
  }

  const response = await fetch(`${NEXTI_BASE_URL}/security/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Nao foi possivel autenticar na Nexti.");
  }

  return body.access_token as string;
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
  const response = await fetch(
    `${NEXTI_BASE_URL}/shifts/personExternalId/${encodeURIComponent(personExternalId)}/referenceDate/${formatNextiDate(
      referenceDate,
    )}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Falha ao consultar horario na Nexti: ${response.status}`);
  }

  const value = payload && typeof payload === "object" && "value" in payload ? payload.value : payload;
  return value && typeof value === "object" ? (value as NextiShift) : null;
}

export async function runConflictCheck(payload: ConflictCheckPayload) {
  const requesterExternalId = payload.requester.personExternalId;
  const substituteExternalId = payload.substitute?.personExternalId || null;

  if (!hasRealExternalId(requesterExternalId) || (payload.requestType === "swap" && !hasRealExternalId(substituteExternalId))) {
    return {
      ok: true,
      issues: [],
      summary: {
        mode: "local_fallback",
        reason: "Colaborador sem externalId na Nexti; validacoes locais do portal foram aplicadas.",
      },
      nextiPayload: {
        skipped: true,
        reason: "missing_person_external_id",
      },
    };
  }

  const token = await fetchNextiToken();
  const requestDate = payload.requestDate;
  const coverageDate = payload.requestType === "swap" ? payload.coverageDate : null;

  const [requesterPrimary, requesterCoverage, substitutePrimary, substituteCoverage] = await Promise.all([
    fetchShiftForPersonOnDate(token, requesterExternalId, requestDate),
    payload.requestType === "swap" && coverageDate
      ? fetchShiftForPersonOnDate(token, requesterExternalId, coverageDate)
      : Promise.resolve(null),
    payload.requestType === "swap" && substituteExternalId
      ? fetchShiftForPersonOnDate(token, substituteExternalId, requestDate)
      : Promise.resolve(null),
    payload.requestType === "swap" && substituteExternalId && coverageDate
      ? fetchShiftForPersonOnDate(token, substituteExternalId, coverageDate)
      : Promise.resolve(null),
  ]);

  const requesterPrimaryResult = classifyShift(requesterPrimary);
  const requesterCoverageResult = classifyShift(requesterCoverage);
  const substitutePrimaryResult = classifyShift(substitutePrimary);
  const substituteCoverageResult = classifyShift(substituteCoverage);
  const issues: string[] = [];

  if (payload.requestType === "swap") {
    if (requesterPrimaryResult.worksOnDate) {
      issues.push("A data da folga precisa ser um dia sem escala regular do solicitante na Nexti.");
    }
    if (!substitutePrimaryResult.worksOnDate) {
      issues.push("O colega informado precisa estar escalado na data da sua folga.");
    }
    if (!requesterCoverageResult.worksOnDate) {
      issues.push("A data de pagamento precisa ser um dia de trabalho regular do solicitante.");
    }
    if (substituteCoverageResult.worksOnDate) {
      issues.push("O colega informado precisa estar de folga na data de pagamento.");
    }
  } else if (requesterPrimaryResult.worksOnDate) {
    issues.push("A FT deve ser solicitada para um dia sem escala de trabalho regular.");
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      mode: "nexti_shift_lookup",
      requesterPrimary: requesterPrimaryResult,
      requesterCoverage: requesterCoverageResult,
      substitutePrimary: substitutePrimaryResult,
      substituteCoverage: substituteCoverageResult,
    },
    nextiPayload: {
      requesterPrimary,
      requesterCoverage,
      substitutePrimary,
      substituteCoverage,
    },
  };
}
