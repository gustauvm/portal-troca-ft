import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { createPortalRequest } from "@/lib/requests/service";

export async function POST(request: Request) {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const created = await createPortalRequest(session, payload);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar a solicitação." },
      { status: 400 },
    );
  }
}
