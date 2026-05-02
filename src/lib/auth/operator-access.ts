import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getAppConfig, getSupabaseConfig } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { OperatorAccessRecord, OperatorRole } from "@/lib/types";

type OperatorAccessRow = Database["public"]["Tables"]["operator_access"]["Row"];

export type OperatorSession = {
  userId: string;
  accessId: string;
  fullName: string;
  email: string;
  role: OperatorRole;
  canViewAll: boolean;
  canEditAll: boolean;
  viewGroupKeys: string[];
  editGroupKeys: string[];
  viewCompanyIds: number[];
  editCompanyIds: number[];
};

export function normalizeOperatorEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function mapAccess(row: OperatorAccessRow): OperatorAccessRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    canViewAll: row.can_view_all,
    canEditAll: row.can_edit_all,
    viewGroupKeys: row.view_group_keys || [],
    editGroupKeys: row.edit_group_keys || [],
    viewCompanyIds: row.view_company_ids || [],
    editCompanyIds: row.edit_company_ids || [],
  };
}

export async function getActiveOperatorAccessByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const normalizedEmail = normalizeOperatorEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await admin
    .from("operator_access")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error("Falha ao validar acesso operacional.");
  }

  return data ? mapAccess(data as OperatorAccessRow) : null;
}

export async function syncOperatorProfileForUser(input: {
  userId: string;
  email: string;
}) {
  const access = await getActiveOperatorAccessByEmail(input.email);
  const admin = createSupabaseAdminClient();

  if (!access) {
    await admin
      .from("operator_profiles")
      .update({ status: "revoked" })
      .eq("user_id", input.userId);
    return null;
  }

  const { error } = await admin.from("operator_profiles").upsert(
    {
      user_id: input.userId,
      access_id: access.id,
      email: access.email,
      full_name: access.fullName || access.email,
      role: access.role,
      status: access.status,
      can_view_all: access.canViewAll,
      can_edit_all: access.canEditAll,
      view_group_keys: access.viewGroupKeys,
      edit_group_keys: access.editGroupKeys,
      view_company_ids: access.viewCompanyIds,
      edit_company_ids: access.editCompanyIds,
    },
    { onConflict: "user_id", ignoreDuplicates: false },
  );

  if (error) {
    throw new Error("Falha ao sincronizar perfil operacional.");
  }

  return {
    userId: input.userId,
    accessId: access.id,
    fullName: access.fullName || access.email,
    email: access.email,
    role: access.role,
    canViewAll: access.canViewAll,
    canEditAll: access.canEditAll,
    viewGroupKeys: access.viewGroupKeys,
    editGroupKeys: access.editGroupKeys,
    viewCompanyIds: access.viewCompanyIds,
    editCompanyIds: access.editCompanyIds,
  } satisfies OperatorSession;
}

export function operatorCanViewScope(
  operator: OperatorSession,
  scope: { groupKey?: string | null; companyId?: number | null },
) {
  if (operator.role === "admin" || operator.canViewAll) return true;
  if (scope.groupKey && operator.viewGroupKeys.includes(scope.groupKey)) return true;
  if (scope.companyId !== null && scope.companyId !== undefined && operator.viewCompanyIds.includes(Number(scope.companyId))) {
    return true;
  }
  return false;
}

export function operatorCanEditScope(
  operator: OperatorSession,
  scope: { groupKey?: string | null; companyId?: number | null },
) {
  if (operator.role === "admin" || operator.canEditAll) return true;
  if (scope.groupKey && operator.editGroupKeys.includes(scope.groupKey)) return true;
  if (scope.companyId !== null && scope.companyId !== undefined && operator.editCompanyIds.includes(Number(scope.companyId))) {
    return true;
  }
  return false;
}

export function assertOperatorCanEdit(
  operator: OperatorSession,
  scope: { groupKey?: string | null; companyId?: number | null },
) {
  if (!operatorCanEditScope(operator, scope)) {
    throw new Error("Seu acesso operacional não permite alterar este grupo/empresa.");
  }
}

export function assertOperatorIsAdmin(operator: OperatorSession) {
  if (operator.role !== "admin") {
    throw new Error("Apenas administradores podem executar esta ação.");
  }
}

export async function listOperatorAccess() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("operator_access")
    .select("*")
    .order("status")
    .order("email");

  if (error) {
    throw new Error("Não foi possível listar acessos operacionais.");
  }

  return ((data || []) as OperatorAccessRow[]).map(mapAccess);
}

export async function upsertOperatorAccess(input: {
  email: string;
  fullName?: string | null;
  role: OperatorRole;
  canViewAll: boolean;
  canEditAll: boolean;
  viewGroupKeys: string[];
  editGroupKeys: string[];
  viewCompanyIds: number[];
  editCompanyIds: number[];
  actorUserId: string;
}) {
  const admin = createSupabaseAdminClient();
  const email = normalizeOperatorEmail(input.email);
  if (!email) throw new Error("Informe um e-mail válido.");

  const { data, error } = await admin
    .from("operator_access")
    .upsert(
      {
        email,
        full_name: input.fullName || email,
        role: input.role,
        status: "active",
        can_view_all: input.role === "admin" ? true : input.canViewAll,
        can_edit_all: input.role === "admin" ? true : input.canEditAll,
        view_group_keys: input.role === "admin" ? [] : input.viewGroupKeys,
        edit_group_keys: input.role === "admin" ? [] : input.editGroupKeys,
        view_company_ids: input.role === "admin" ? [] : input.viewCompanyIds,
        edit_company_ids: input.role === "admin" ? [] : input.editCompanyIds,
        created_by: input.actorUserId,
        revoked_by: null,
        revoked_at: null,
      },
      { onConflict: "email", ignoreDuplicates: false },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Não foi possível salvar o acesso operacional.");
  }

  return mapAccess(data as OperatorAccessRow);
}

export async function revokeOperatorAccess(input: {
  email: string;
  actorUserId: string;
}) {
  const admin = createSupabaseAdminClient();
  const email = normalizeOperatorEmail(input.email);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("operator_access")
    .update({
      status: "revoked",
      revoked_by: input.actorUserId,
      revoked_at: now,
      can_view_all: false,
      can_edit_all: false,
      view_group_keys: [],
      edit_group_keys: [],
      view_company_ids: [],
      edit_company_ids: [],
    })
    .eq("email", email)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Não foi possível remover o acesso operacional.");
  }

  await admin
    .from("operator_profiles")
    .update({ status: "revoked", can_view_all: false, can_edit_all: false })
    .eq("email", email);

  return mapAccess(data as OperatorAccessRow);
}

export async function findAuthUserByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Falha ao consultar usuários do Supabase Auth.");
    const found = data.users.find((user) => normalizeOperatorEmail(user.email || "") === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function createOperatorFirstAccess(input: {
  email: string;
  password: string;
  confirmation: string;
}) {
  const email = normalizeOperatorEmail(input.email);
  if (input.password.length < 8) {
    throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  }
  if (input.password !== input.confirmation) {
    throw new Error("As senhas não conferem.");
  }

  const access = await getActiveOperatorAccessByEmail(email);
  if (!access) {
    throw new Error("Este e-mail não está liberado para acesso operacional.");
  }

  const existingUser = await findAuthUserByEmail(email);
  if (existingUser) {
    await syncOperatorProfileForUser({ userId: existingUser.id, email });
    throw new Error("Este e-mail já tem conta. Use Entrar ou Trocar senha.");
  }

  const config = getSupabaseConfig();
  const appConfig = getAppConfig();
  const anonClient = createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await anonClient.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${appConfig.appUrl.replace(/\/$/, "")}/operacao/auth/callback`,
      data: {
        role: access.role,
        access_id: access.id,
      },
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message || "Não foi possível criar a conta operacional.");
  }

  await syncOperatorProfileForUser({ userId: data.user.id, email });
  return { ok: true, requiresConfirmation: !data.session };
}

export async function requestOperatorPasswordEmail(emailInput: string) {
  const email = normalizeOperatorEmail(emailInput);
  const access = await getActiveOperatorAccessByEmail(email);
  if (!access) {
    throw new Error("Este e-mail não está liberado para acesso operacional.");
  }

  const config = getSupabaseConfig();
  const appConfig = getAppConfig();
  const redirectTo = `${appConfig.appUrl.replace(/\/$/, "")}/operacao/auth/callback`;
  const authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    throw new Error("Conta ainda não criada. Use Primeiro acesso para definir a senha inicial.");
  }

  await syncOperatorProfileForUser({ userId: authUser.id, email });
  const anonClient = createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { error } = await anonClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message || "Não foi possível enviar o link de senha.");
  return { ok: true, mode: "recovery" as const };
}
