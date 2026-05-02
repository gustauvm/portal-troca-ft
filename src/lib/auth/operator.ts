import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncOperatorProfileForUser, type OperatorSession } from "@/lib/auth/operator-access";

export async function getOperatorSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  if (!user.email) return null;

  const synced = await syncOperatorProfileForUser({
    userId: user.id,
    email: user.email,
  });

  if (!synced) return null;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("operator_profiles")
    .select("user_id, access_id, full_name, role, email, status, can_view_all, can_edit_all, view_group_keys, edit_group_keys, view_company_ids, edit_company_ids")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.status !== "active") return null;

  return {
    userId: profile.user_id as string,
    accessId: profile.access_id as string,
    fullName: (profile.full_name as string | null) || user.email || "Operação",
    email: (profile.email as string | null) || user.email || "",
    role: profile.role,
    canViewAll: profile.can_view_all,
    canEditAll: profile.can_edit_all,
    viewGroupKeys: profile.view_group_keys || [],
    editGroupKeys: profile.edit_group_keys || [],
    viewCompanyIds: profile.view_company_ids || [],
    editCompanyIds: profile.edit_company_ids || [],
  } satisfies OperatorSession;
}

export async function requireOperatorSession() {
  const session = await getOperatorSession();
  if (!session) {
    redirect("/operacao/entrar");
  }
  return session;
}
