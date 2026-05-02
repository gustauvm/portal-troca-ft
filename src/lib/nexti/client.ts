import "server-only";

type PageEnvelope<T> = {
  content?: T[];
  totalPages?: number;
  last?: boolean;
};

const DEFAULT_NEXTI_BASE_URL = "https://api.nexti.com";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function assertReadOnlyMethod(method?: string) {
  const normalized = String(method || "GET").trim().toUpperCase();
  if (!["GET", "HEAD"].includes(normalized)) {
    throw new Error(`Operacao bloqueada: Nexti esta em modo somente leitura neste portal (${normalized}).`);
  }
  return normalized;
}

export function getNextiBaseUrl() {
  return (process.env.NEXTI_API_BASE_URL || DEFAULT_NEXTI_BASE_URL).replace(/\/$/, "");
}

export async function fetchNextiToken() {
  const credentials = Buffer.from(`${requireEnv("NEXTI_CLIENT_ID")}:${requireEnv("NEXTI_CLIENT_SECRET")}`).toString(
    "base64",
  );

  const response = await fetch(`${getNextiBaseUrl()}/security/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Nao foi possivel autenticar na Nexti.");
  }

  return payload.access_token;
}

export async function nextiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const method = assertReadOnlyMethod(init?.method);
  const response = await fetch(`${getNextiBaseUrl()}${path}`, {
    ...init,
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};

  if (response.status === 404) {
    throw new Error("Registro nao encontrado na Nexti.");
  }

  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as { message?: string; error?: string } : {};
    throw new Error(body.message || body.error || `Falha na API Nexti: ${response.status}`);
  }

  return payload as T;
}

function unwrapPage<T>(payload: unknown): PageEnvelope<T> {
  if (payload && typeof payload === "object" && "value" in payload) {
    const value = (payload as { value?: unknown }).value;
    if (value && typeof value === "object") {
      return value as PageEnvelope<T>;
    }
  }

  return payload as PageEnvelope<T>;
}

export function unwrapValue<T>(payload: unknown) {
  if (payload && typeof payload === "object" && "value" in payload) {
    return (payload as { value?: T }).value ?? null;
  }

  return payload as T;
}

export async function fetchAllPages<T>(
  path: string,
  token: string,
  query: Record<string, string | number | boolean | undefined | null> = {},
  pageSize = 250,
) {
  const rows: T[] = [];

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });
    params.set("page", String(page));
    params.set("size", String(pageSize));

    const payload = await nextiRequest<unknown>(`${path}?${params.toString()}`, token);
    const envelope = unwrapPage<T>(payload);
    const content = Array.isArray(envelope.content) ? envelope.content : [];
    rows.push(...content);

    if (envelope.last === true) break;
    if (typeof envelope.totalPages === "number" && page >= envelope.totalPages - 1) break;
    if (content.length === 0) break;
  }

  return rows;
}

export function formatNextiDate(date: string, time = "000000") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) {
    throw new Error(`Data invalida para a Nexti: ${date}`);
  }

  const [, year, month, day] = match;
  return `${day}${month}${year}${time}`;
}

export function getNextiDayRange(date: string) {
  return {
    start: formatNextiDate(date, "000000"),
    finish: formatNextiDate(date, "235959"),
  };
}

export function nextiDateTimeToIsoDate(value?: string | null) {
  const match = /^(\d{2})(\d{2})(\d{4})/.exec(String(value || "").trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function nextiDateTimeToIsoString(value?: string | null) {
  const match = /^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})?/.exec(String(value || "").trim());
  if (!match) return null;
  const [, day, month, year, hour, minute, second = "00"] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`;
}

export function isSameNextiDay(isoDate: string, nextiDateTime?: string | null) {
  return nextiDateTimeToIsoDate(nextiDateTime) === isoDate;
}
