import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { getEmployeePortalContext } from "@/lib/directory/service";

export async function GET() {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const context = await getEmployeePortalContext(session.employeeId);
  if (!context) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }

  return NextResponse.json(context);
}
