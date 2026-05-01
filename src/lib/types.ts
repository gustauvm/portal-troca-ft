export type RequestType = "swap" | "ft";
export type WorkflowStatus = "submitted" | "approved" | "rejected" | "cancelled";
export type LaunchStatus = "waiting" | "matched" | "not_found" | "error";
export type OperatorRole = "operator" | "admin";

export type EmployeeDirectoryRecord = {
  id: string;
  nextiPersonId: number;
  personExternalId: string;
  enrolment: string;
  enrolmentAliases: string[];
  cpfDigits: string;
  fullName: string;
  groupKey: string;
  companyId: number | null;
  companyName: string;
  companyExternalId: string | null;
  companyNumber: string | null;
  businessUnitId: number | null;
  businessUnitName: string | null;
  workplaceId: number | null;
  workplaceExternalId: string | null;
  workplaceName: string | null;
  clientName: string | null;
  careerId: number | null;
  careerExternalId: string | null;
  careerName: string | null;
  scheduleId: number | null;
  scheduleExternalId: string | null;
  scheduleName: string | null;
  shiftId: number | null;
  shiftExternalId: string | null;
  shiftName: string | null;
  rotationId: number | null;
  rotationCode: number | null;
  personSituationId: number;
  situationLabel: string;
  admissionDate: string | null;
  isActive: boolean;
  syncFingerprint: string;
};

export type WorkplaceDirectoryRecord = {
  id: string;
  nextiWorkplaceId: number;
  workplaceExternalId: string;
  name: string;
  clientName: string | null;
  serviceName: string | null;
  groupKey: string;
  companyId: number | null;
  companyName: string | null;
  companyExternalId: string | null;
  companyNumber: string | null;
  businessUnitId: number | null;
  businessUnitName: string | null;
  isActive: boolean;
  syncFingerprint: string;
};

export type PortalRequestRecord = {
  id: string;
  requestType: RequestType;
  workflowStatus: WorkflowStatus;
  launchStatus: LaunchStatus;
  groupKey: string;
  payrollReference: string;
  payrollPeriodStart: string;
  payrollPeriodEnd: string;
  requesterName: string;
  requesterEnrolment: string;
  substituteName: string | null;
  substituteEnrolment: string | null;
  workplaceName: string | null;
  requestDate: string;
  coverageDate: string | null;
  reason: string;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  launchedAt: string | null;
  assignedOperatorName: string | null;
};

export type PayrollReferenceOption = {
  reference: string;
  periodStart: string;
  periodEnd: string;
};

export type EmployeePortalContext = {
  employee: EmployeeDirectoryRecord;
  payroll: PayrollReferenceOption;
  payrollOptions: PayrollReferenceOption[];
};

export type EmployeeOptionsResponse = {
  workplaces: WorkplaceDirectoryRecord[];
  candidates: EmployeeDirectoryRecord[];
};

export type HistoryResponse = {
  payrollReference: string;
  payrollWindow: PayrollReferenceOption;
  payrollOptions: PayrollReferenceOption[];
  items: PortalRequestRecord[];
};

export type OperatorFiltersResponse = {
  groups: string[];
  companies: Array<{ id: number; name: string }>;
  careers: Array<{ id: number; name: string }>;
  workplaces: Array<{ id: number; groupKey: string; name: string }>;
  schedules?: Array<{ id: number; name: string }>;
  shifts?: Array<{ id: number; name: string }>;
};

export type OpsRequestsResponse = {
  items: PortalRequestRecord[];
  page: number;
  limit: number;
  total: number;
};
