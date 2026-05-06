export type RequestType = "swap" | "ft";
export type WorkflowStatus = "submitted" | "approved" | "rejected" | "cancelled";
export type LaunchStatus = "waiting" | "matched" | "not_found" | "error";
export type LaunchSource = "schedule_transfer" | "replacement" | "manual";
export type OperationalStatus = "pending" | "approved" | "rejected" | "cancelled" | "launched" | "launched_manual" | "corrected";
export type OperatorRole = "operator" | "admin";
export type ShiftTurn = "diurno" | "noturno" | "indefinido";

export type EmployeeDirectoryRecord = {
  id: string;
  nextiPersonId: number;
  personExternalId: string;
  enrolment: string;
  enrolmentAliases: string[];
  cpfDigits: string;
  fullName: string;
  phone: string | null;
  phone2: string | null;
  whatsappPhone: string | null;
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
  cancelReason: string | null;
  assignedOperatorName: string | null;
  launchSource: LaunchSource;
  operationalStatus: OperationalStatus;
  operationNote: string | null;
  manualAuthorizationNote: string | null;
  ftReasonLabel: string | null;
  coveredName: string | null;
  coveredEnrolment: string | null;
  selectedShiftName: string | null;
  selectedShiftTurn: ShiftTurn | null;
};

export type EmployeeHistoryItem = {
  id: string;
  source: "portal" | "nexti";
  viewerRole: "requester" | "substitute" | "unknown";
  requestType: RequestType;
  workflowStatus: WorkflowStatus;
  launchStatus: LaunchStatus;
  launchSource: LaunchSource;
  operationalStatus: OperationalStatus;
  groupKey: string;
  payrollReference: string;
  payrollPeriodStart: string;
  payrollPeriodEnd: string;
  requesterName: string;
  requesterEnrolment: string | null;
  substituteName: string | null;
  substituteEnrolment: string | null;
  workplaceName: string | null;
  requestDate: string;
  coverageDate: string | null;
  reason: string;
  createdAt: string;
  launchedAt: string | null;
  cancelReason: string | null;
  ftReasonLabel: string | null;
  selectedShiftName: string | null;
  selectedShiftTurn: ShiftTurn | null;
  canCancel: boolean;
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
  shifts?: ShiftDirectoryRecord[];
};

export type HistoryResponse = {
  payrollReference: string;
  payrollWindow: PayrollReferenceOption;
  payrollOptions: PayrollReferenceOption[];
  items: EmployeeHistoryItem[];
};

export type OperatorFiltersResponse = {
  groups: string[];
  companies: Array<{ id: number; name: string }>;
  careers: Array<{ id: number; name: string }>;
  workplaces: Array<{ id: number; groupKey: string; name: string }>;
  schedules?: Array<{ id: number; name: string }>;
  shifts?: Array<{ id: number; name: string }>;
};

export type ShiftDirectoryRecord = {
  id: string;
  nextiShiftId: number;
  shiftExternalId: string | null;
  name: string;
  turn: ShiftTurn;
  isPreAssigned: boolean;
  isActive: boolean;
};

export type OperatorAccessRecord = {
  id: string;
  email: string;
  fullName: string | null;
  role: OperatorRole;
  status: "active" | "revoked";
  canViewAll: boolean;
  canEditAll: boolean;
  viewGroupKeys: string[];
  editGroupKeys: string[];
  viewCompanyIds: number[];
  editCompanyIds: number[];
};

export type OpsRequestsResponse = {
  items: PortalRequestRecord[];
  page: number;
  limit: number;
  total: number;
};

export type NextiLaunchHistoryRecord = {
  id: string;
  requestType: RequestType;
  nextiSource: "schedule_transfer" | "replacement";
  nextiRecordId: number;
  groupKey: string;
  payrollReference: string;
  requesterName: string;
  requesterEnrolment: string | null;
  requesterIsActive: boolean;
  substituteName: string | null;
  substituteEnrolment: string | null;
  companyId: number | null;
  companyName: string | null;
  careerId: number | null;
  careerName: string | null;
  scheduleId: number | null;
  scheduleName: string | null;
  shiftId: number | null;
  shiftName: string | null;
  workplaceId: number | null;
  workplaceName: string | null;
  requestDate: string;
  coverageDate: string | null;
  nextiCreatedAt: string | null;
  nextiLastUpdate: string | null;
};

export type OpsLaunchHistoryResponse = {
  items: NextiLaunchHistoryRecord[];
  page: number;
  limit: number;
  total: number;
};
