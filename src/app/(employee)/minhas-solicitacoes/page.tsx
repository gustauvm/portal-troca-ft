import { redirect } from "next/navigation";
import { HistoryPanel } from "@/components/employee/history-panel";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";

export default async function MyRequestsPage() {
  const session = await getEmployeeSession();
  if (!session) redirect("/entrar");

  const context = await getEmployeePortalContext(session.employeeId);
  if (!context) redirect("/entrar");

  return <HistoryPanel initialPayrollReference={context.payroll.reference} />;
}
