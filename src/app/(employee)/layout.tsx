import { redirect } from "next/navigation";
import { EmployeeShell } from "@/components/app-shell/employee-shell";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";

export default async function EmployeeAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getEmployeeSession();
  if (!session) {
    redirect("/entrar");
  }

  const context = await getEmployeePortalContext(session.employeeId);
  if (!context) {
    redirect("/entrar");
  }

  return <EmployeeShell employee={context.employee}>{children}</EmployeeShell>;
}
