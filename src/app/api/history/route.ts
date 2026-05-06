import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";
import { syncNextiLaunchHistoryForEmployee } from "@/lib/nexti/launch-history-sync";
import { listEmployeeHistory } from "@/lib/requests/service";

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
  const requestTypeParam = searchParams.get("requestType");
  const requestType =
    requestTypeParam === "swap" || requestTypeParam === "ft" || requestTypeParam === "all"
      ? requestTypeParam
      : "all";

  try {
    await syncNextiLaunchHistoryForEmployee({
      employeeId: session.employeeId,
      payrollReference,
    });
  } catch (error) {
    console.error("Falha no sync sob demanda do historico Nexti", error);
  }

  const items = await listEmployeeHistory(session, payrollReference, requestType);

  return NextResponse.json({
    payrollReference,
    payrollWindow:
      context.payrollOptions.find((item) => item.reference === payrollReference) || context.payroll,
    payrollOptions: context.payrollOptions,
    items,
  });
}
