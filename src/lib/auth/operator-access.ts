import "server-only";

import { randomUUID } from "node:crypto";
import { findEmployeeByEnrolment, getEmployeeForLoginFresh } from "@/lib/directory/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { OperatorAccessRecord, OperatorRole } from "@/lib/types";

type OperatorAccessRow = Database["public"]["Tables"]["operator_access"]["Row"];

export type OperatorSession = {
  userId: string;
  accessId: string;
  employeeId: string;
  enrolment: string;
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

function buildSyntheticOperatorEmail(employeeId: string) {
  return `operator+${employeeId}@portal.local`;
}

function mapAccess(row: OperatorAccessRow): OperatorAccessRecord {
  return {
    id: row.id,
    email: row.email,
    employeeId: row.employee_id,
    employeeEnrolment: row.employee_enrolment,
    employeeName: row.employee_name,
    nextiPersonId: row.nexti_person_id,
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

function mapOperatorSession(access: OperatorAccessRow, authUserId: string): OperatorSession {
  if (!access.employee_id) {
    throw new Error("Acesso operacional sem colaborador vinculado.");
  }

  return {
    userId: authUserId,
    accessId: access.id,
    employeeId: access.employee_id,
    enrolment: access.employee_enrolment || "",
    fullName: access.full_name || access.employee_name || "Operação",
    email: access.email,
    role: access.role,
    canViewAll: access.can_view_all,
    canEditAll: access.can_edit_all,
    viewGroupKeys: access.view_group_keys || [],
    editGroupKeys: access.edit_group_keys || [],
    viewCompanyIds: access.view_company_ids || [],
    editCompanyIds: access.edit_company_ids || [],
  };
}

export async function ensureOperatorTechnicalAuthUser(access: OperatorAccessRow) {
  if (access.auth_user_id) return access.auth_user_id;
  if (!access.employee_id) {
    throw new Error("Acesso operacional sem colaborador vinculado.");
  }

  const admin = createSupabaseAdminClient();
  const email = access.email || buildSyntheticOperatorEmail(access.employee_id);
  const existingUser = await findAuthUserByEmail(email);
  const userId =
    existingUser?.id ||
    (
      await admin.auth.admin.createUser({
        email,
        password: randomUUID() + randomUUID(),
        email_confirm: true,
        user_metadata: {
          role: access.role,
          access_id: access.id,
          employee_id: access.employee_id,
        },
      })
    ).data.user?.id;

  if (!userId) {
    throw new Error("Não foi possível preparar o acesso operacional.");
  }

  const { error } = await admin
    .from("operator_access")
    .update({ auth_user_id: userId })
    .eq("id", access.id);
  if (error) {
    throw new Error("Não foi possível vincular o acesso operacional.");
  }

  await syncOperatorProfileForAccess(access, userId);
  return userId;
}

export async function getActiveOperatorAccessByEmployeeId(employeeId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("operator_access")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error("Falha ao validar acesso operacional.");
  }

  return data as OperatorAccessRow | null;
}

export async function getActiveOperatorAccessById(accessId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("operator_access")
    .select("*")
    .eq("id", accessId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error("Falha ao validar acesso operacional.");
  }

  return data as OperatorAccessRow | null;
}

export async function syncOperatorProfileForAccess(access: OperatorAccessRow, authUserId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("operator_profiles").upsert(
    {
      user_id: authUserId,
      access_id: access.id,
      email: access.email,
      full_name: access.full_name || access.employee_name || access.employee_enrolment || "Operação",
      role: access.role,
      status: access.status,
      can_view_all: access.can_view_all,
      can_edit_all: access.can_edit_all,
      view_group_keys: access.view_group_keys || [],
      edit_group_keys: access.edit_group_keys || [],
      view_company_ids: access.view_company_ids || [],
      edit_company_ids: access.edit_company_ids || [],
    },
    { onConflict: "user_id", ignoreDuplicates: false },
  );

  if (error) {
    throw new Error("Falha ao sincronizar perfil operacional.");
  }
}

export async function createOperatorSessionFromEmployeeLogin(input: { enrolment: string; cpf: string }) {
  const employee = await getEmployeeForLoginFresh(input.enrolment, input.cpf);
  if (!employee) {
    throw new Error("Colaborador não encontrado com a matrícula e CPF informados.");
  }

  const access = await getActiveOperatorAccessByEmployeeId(employee.id);
  if (!access) {
    throw new Error("Esta matrícula não está liberada para acesso operacional.");
  }

  const authUserId = await ensureOperatorTechnicalAuthUser(access);
  return mapOperatorSession(access, authUserId);
}

export async function getOperatorSessionByAccessId(accessId: string) {
  const access = await getActiveOperatorAccessById(accessId);
  if (!access) return null;
  const authUserId = await ensureOperatorTechnicalAuthUser(access);
  await syncOperatorProfileForAccess(access, authUserId);
  return mapOperatorSession(access, authUserId);
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
    .not("employee_id", "is", null)
    .order("status")
    .order("employee_name");

  if (error) {
    throw new Error("Não foi possível listar acessos operacionais.");
  }

  return ((data || []) as OperatorAccessRow[]).map(mapAccess);
}

export async function upsertOperatorAccess(input: {
  enrolment: string;
  role: OperatorRole;
  canViewAll: boolean;
  canEditAll: boolean;
  viewGroupKeys: string[];
  editGroupKeys: string[];
  viewCompanyIds: number[];
  editCompanyIds: number[];
  actorUserId: string;
}) {
  const employee = await findEmployeeByEnrolment(input.enrolment, { activeOnly: true });
  if (!employee) {
    throw new Error("Matrícula não encontrada ou colaborador inativo.");
  }

  const admin = createSupabaseAdminClient();
  const email = buildSyntheticOperatorEmail(employee.id);
  const { data, error } = await admin
    .from("operator_access")
    .upsert(
      {
        email,
        employee_id: employee.id,
        employee_enrolment: employee.enrolment,
        employee_name: employee.fullName,
        nexti_person_id: employee.nextiPersonId,
        full_name: employee.fullName,
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
      { onConflict: "employee_id", ignoreDuplicates: false },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Não foi possível salvar o acesso operacional.");
  }

  await ensureOperatorTechnicalAuthUser(data as OperatorAccessRow);
  return mapAccess(data as OperatorAccessRow);
}

export async function revokeOperatorAccess(input: {
  id: string;
  actorUserId: string;
}) {
  const admin = createSupabaseAdminClient();
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
    .eq("id", input.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Não foi possível remover o acesso operacional.");
  }

  await admin
    .from("operator_profiles")
    .update({ status: "revoked", can_view_all: false, can_edit_all: false })
    .eq("access_id", input.id);

  return mapAccess(data as OperatorAccessRow);
}

export async function findAuthUserByEmail(email: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const admin = createSupabaseAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Falha ao consultar usuários do Supabase Auth.");
    const found = data.users.find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function createOperatorFirstAccess() {
  throw new Error("Primeiro acesso por e-mail foi desativado. Use matrícula e CPF.");
}

export async function resetOperatorPasswordDirect() {
  throw new Error("Troca de senha por e-mail foi desativada. Use matrícula e CPF.");
}
