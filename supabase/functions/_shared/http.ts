import { corsHeaders } from "./cors.ts";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return jsonResponse(
    {
      error: message,
      details: details ?? null
    },
    status
  );
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const text = await request.text();
  return text ? JSON.parse(text) as T : {} as T;
}
