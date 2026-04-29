const DEFAULT_NEXTI_BASE_URL = "https://api.nexti.com";

type PageEnvelope<T> = {
  content?: T[];
  totalPages?: number;
  number?: number;
  last?: boolean;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getNextiBaseUrl() {
  return (Deno.env.get("NEXTI_API_BASE_URL") || DEFAULT_NEXTI_BASE_URL).replace(/\/$/, "");
}

export async function fetchNextiToken() {
  const baseUrl = getNextiBaseUrl();
  const clientId = requireEnv("NEXTI_CLIENT_ID");
  const clientSecret = requireEnv("NEXTI_CLIENT_SECRET");
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials"
  });

  const response = await fetch(`${baseUrl}/security/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Nao foi possivel autenticar na Nexti.");
  }

  return payload.access_token as string;
}

export async function nextiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getNextiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Nexti request failed: ${response.status}`);
  }

  return payload as T;
}

function unwrapPage<T>(payload: unknown): PageEnvelope<T> {
  if (payload && typeof payload === "object" && "value" in payload && payload.value && typeof payload.value === "object") {
    return payload.value as PageEnvelope<T>;
  }

  return payload as PageEnvelope<T>;
}

export async function fetchAllPages<T>(
  path: string,
  token: string,
  query: Record<string, string | number | boolean | undefined> = {},
  pageSize = 200
) {
  const items: T[] = [];
  let page = 0;

  while (page < 100) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });
    params.set("page", String(page));
    params.set("size", String(pageSize));

    const payload = await nextiRequest<PageEnvelope<T>>(`${path}?${params.toString()}`, token);
    const envelope = unwrapPage<T>(payload);
    const content = Array.isArray(envelope.content) ? envelope.content : [];

    items.push(...content);

    if (envelope.last === true) break;
    if (typeof envelope.totalPages === "number" && page >= envelope.totalPages - 1) break;
    if (content.length === 0) break;

    page += 1;
  }

  return items;
}
