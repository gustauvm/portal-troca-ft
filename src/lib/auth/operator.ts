import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OperatorRole } from "@/lib/types";

export async function getOperatorSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("operator_profiles")
    .select("user_id, full_name, role, email")
    .eq("user_id", user.id)
    .single();

  if (!profile) return null;

  return {
    userId: profile.user_id as string,
    fullName: (profile.full_name as string | null) || user.email || "Operação",
    email: (profile.email as string | null) || user.email || "",
    role: profile.role as OperatorRole,
  };
}

export async function requireOperatorSession() {
  const session = await getOperatorSession();
  if (!session) {
    redirect("/operacao/entrar");
  }
  return session;
}
