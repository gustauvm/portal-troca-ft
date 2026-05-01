import { redirect } from "next/navigation";
import { EmployeeRequestForm } from "@/components/employee/request-form";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";

export default async function FtPage() {
  const session = await getEmployeeSession();
  if (!session) redirect("/entrar");

  const context = await getEmployeePortalContext(session.employeeId);
  if (!context) redirect("/entrar");

  return <EmployeeRequestForm requestType="ft" context={context} />;
}
