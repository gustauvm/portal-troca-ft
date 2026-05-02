import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function createServiceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function appendRequestEvent(input: {
  requestId: string;
  actorType: "employee" | "operator" | "system";
  actorId?: string | null;
  actorLabel?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  await supabase.from("request_events").insert({
    request_id: input.requestId,
    actor_type: input.actorType,
    actor_id: input.actorId || null,
    actor_label: input.actorLabel || null,
    event_type: input.eventType,
    payload: input.payload || {},
  });
}
