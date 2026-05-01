import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentPayrollWindow, buildPayrollReferences } from "@/lib/utils/payroll";
import { buildEnrolmentAliases, matchesEnrolmentAlias, normalizeCpf } from "@/lib/utils/identity";

type EmployeeRow = {
  id: string;
  nexti_person_id: number;
  person_external_id: string;
  enrolment: string;
  enrolment_aliases: string[];
  cpf_digits: string;
  full_name: string;
  group_key: string;
  company_id: number | null;
  company_name: string;
  company_external_id: string | null;
  company_number: string | null;
  business_unit_id: number | null;
  business_unit_name: string | null;
  workplace_id: number | null;
  workplace_external_id: string | null;
  workplace_name: string | null;
  client_name: string | null;
  career_id: number | null;
  career_external_id: string | null;
  career_name: string | null;
  schedule_id: number | null;
  schedule_external_id: string | null;
  schedule_name: string | null;
  shift_id: number | null;
  shift_external_id: string | null;
  shift_name: string | null;
  rotation_id: number | null;
  rotation_code: number | null;
  person_situation_id: number;
  situation_label: string;
  admission_date: string | null;
  is_active: boolean;
};

type WorkplaceRow = {
  id: string;
  nexti_workplace_id: number;
  workplace_external_id: string;
  name: string;
  client_name: string | null;
  service_name: string | null;
  group_key: string;
  company_id: number | null;
  company_name: string | null;
  business_unit_id: number | null;
  business_unit_name: string | null;
  is_active: boolean;
};

function mapEmployee(row: EmployeeRow) {
  return {
    id: row.id,
    nextiPersonId: row.nexti_person_id,
    personExternalId: row.person_external_id,
    enrolment: row.enrolment,
    enrolmentAliases: row.enrolment_aliases || buildEnrolmentAliases(row.enrolment),
    cpfDigits: row.cpf_digits,
    fullName: row.full_name,
    groupKey: row.group_key,
    companyId: row.company_id,
    companyName: row.company_name,
    companyExternalId: row.company_external_id,
    companyNumber: row.company_number,
    businessUnitId: row.business_unit_id,
    businessUnitName: row.business_unit_name,
    workplaceId: row.workplace_id,
    workplaceExternalId: row.workplace_external_id,
    workplaceName: row.workplace_name,
    clientName: row.client_name,
    careerId: row.career_id,
    careerExternalId: row.career_external_id,
    careerName: row.career_name,
    scheduleId: row.schedule_id,
    scheduleExternalId: row.schedule_external_id,
    scheduleName: row.schedule_name,
    shiftId: row.shift_id,
    shiftExternalId: row.shift_external_id,
    shiftName: row.shift_name,
    rotationId: row.rotation_id,
    rotationCode: row.rotation_code,
    personSituationId: row.person_situation_id,
    situationLabel: row.situation_label,
    admissionDate: row.admission_date,
    isActive: row.is_active,
  };
}

function mapWorkplace(row: WorkplaceRow) {
  return {
    id: row.id,
    nextiWorkplaceId: row.nexti_workplace_id,
    workplaceExternalId: row.workplace_external_id,
    name: row.name,
    clientName: row.client_name,
    serviceName: row.service_name,
    groupKey: row.group_key,
    companyId: row.company_id,
    companyName: row.company_name,
    businessUnitId: row.business_unit_id,
    businessUnitName: row.business_unit_name,
    isActive: row.is_active,
  };
}

export async function getEmployeeById(employeeId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("employee_directory")
    .select("*")
    .eq("id", employeeId)
    .single();

  return data ? mapEmployee(data as EmployeeRow) : null;
}

export async function getEmployeeForLogin(enrolment: string, cpf: string) {
  const admin = createSupabaseAdminClient();
  const cpfDigits = normalizeCpf(cpf);

  const { data, error } = await admin
    .from("employee_directory")
    .select("*")
    .eq("cpf_digits", cpfDigits)
    .eq("is_active", true)
    .limit(20);

  if (error) {
    throw new Error("Falha ao validar o colaborador.");
  }

  const matches = ((data || []) as EmployeeRow[]).filter((row) =>
    matchesEnrolmentAlias(enrolment, row.enrolment_aliases || []),
  );

  if (matches.length === 1) {
    return mapEmployee(matches[0]);
  }

  if (matches.length > 1) {
    throw new Error("A matrícula informada corresponde a mais de um colaborador ativo. Revise o cadastro.");
  }

  return null;
}

export async function getEmployeePortalContext(employeeId: string) {
  const employee = await getEmployeeById(employeeId);
  if (!employee || !employee.isActive) {
    return null;
  }

  const payroll = getCurrentPayrollWindow();
  const startDate = employee.admissionDate || payroll.periodStart;

  return {
    employee,
    payroll,
    payrollOptions: buildPayrollReferences(startDate),
  };
}

export async function searchSwapCandidates(
  employeeId: string,
  search: string,
  limit = 25,
) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return [];

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("employee_directory")
    .select("*")
    .eq("group_key", employee.groupKey)
    .eq("is_active", true)
    .neq("id", employee.id)
    .order("full_name")
    .limit(limit);

  if (employee.companyId !== null) {
    query = query.eq("company_id", employee.companyId);
  }

  if (employee.careerId !== null) {
    query = query.eq("career_id", employee.careerId);
  }

  const searchTerm = String(search || "").trim();
  if (searchTerm) {
    query = query.or(`full_name.ilike.%${searchTerm}%,enrolment.ilike.%${searchTerm}%`);
  }

  const { data } = await query;
  return ((data || []) as EmployeeRow[]).map(mapEmployee);
}

export async function listWorkplacesForEmployee(employeeId: string) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return [];

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("workplace_directory")
    .select("*")
    .eq("group_key", employee.groupKey)
    .eq("is_active", true)
    .order("name");

  if (employee.companyId !== null) {
    query = query.eq("company_id", employee.companyId);
  }

  const { data } = await query;

  return ((data || []) as WorkplaceRow[]).map(mapWorkplace);
}

export async function getWorkplaceById(workplaceId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workplace_directory")
    .select("*")
    .eq("id", workplaceId)
    .single();

  return data ? mapWorkplace(data as WorkplaceRow) : null;
}

export async function getOperationalFilterOptions() {
  const admin = createSupabaseAdminClient();
  const [employeesResult, workplacesResult] = await Promise.all([
    admin
      .from("employee_directory")
      .select("group_key, company_id, company_name, career_id, career_name, schedule_id, schedule_name, shift_id, shift_name")
      .eq("is_active", true)
      .order("company_name")
      .order("career_name"),
    admin
      .from("workplace_directory")
      .select("group_key, nexti_workplace_id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const employeeRows = (employeesResult.data || []) as Array<{
    group_key: string;
    company_id: number | null;
    company_name: string;
    career_id: number | null;
    career_name: string | null;
    schedule_id: number | null;
    schedule_name: string | null;
    shift_id: number | null;
    shift_name: string | null;
  }>;

  const workplaceRows = (workplacesResult.data || []) as Array<{
    group_key: string;
    nexti_workplace_id: number;
    name: string;
  }>;

  const groups = Array.from(new Set(employeeRows.map((item) => item.group_key))).sort();
  const companies = Array.from(
    new Map(
      employeeRows
        .flatMap((item) =>
          item.company_id !== null
            ? [[item.company_id, { id: item.company_id, name: item.company_name }] as const]
            : [],
        ),
    ).values(),
  );

  const careers = Array.from(
    new Map(
      employeeRows
        .flatMap((item) =>
          item.career_id !== null
            ? [[item.career_id, { id: item.career_id, name: item.career_name || "Cargo" }] as const]
            : [],
        ),
    ).values(),
  );

  const workplaces = workplaceRows.map((item) => ({
    id: item.nexti_workplace_id,
    groupKey: item.group_key,
    name: item.name,
  }));

  const schedules = Array.from(
    new Map(
      employeeRows
        .flatMap((item) =>
          item.schedule_id !== null
            ? [[item.schedule_id, { id: item.schedule_id, name: item.schedule_name || "Escala" }] as const]
            : [],
        ),
    ).values(),
  );

  const shifts = Array.from(
    new Map(
      employeeRows
        .flatMap((item) =>
          item.shift_id !== null
            ? [[item.shift_id, { id: item.shift_id, name: item.shift_name || "Horário" }] as const]
            : [],
        ),
    ).values(),
  );

  return {
    groups,
    companies,
    careers,
    workplaces,
    schedules,
    shifts,
  };
}
