import type { LaunchStatus, WorkflowStatus } from "@/lib/types";

export function getWorkflowLabel(status: WorkflowStatus) {
  switch (status) {
    case "submitted":
      return "Pendente";
    case "approved":
      return "Aprovada";
    case "rejected":
      return "Rejeitada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

export function getLaunchLabel(status: LaunchStatus) {
  switch (status) {
    case "waiting":
      return "Aguardando lançamento";
    case "matched":
      return "Lançada";
    case "not_found":
      return "Ainda não localizada";
    case "error":
      return "Erro de conciliação";
    default:
      return status;
  }
}
