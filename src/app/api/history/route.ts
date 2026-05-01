import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";
import { listEmployeeRequests } from "@/lib/requests/service";

export async function GET(request: Request) {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const context = await getEmployeePortalContext(session.employeeId);
  if (!context) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const payrollReference = searchParams.get("payrollReference") || context.payroll.reference;
  const items = await listEmployeeRequests(session, payrollReference);

  return NextResponse.json({
    payrollReference,
    payrollWindow:
      context.payrollOptions.find((item) => item.reference === payrollReference) || context.payroll,
    payrollOptions: context.payrollOptions,
    items,
  });
}
