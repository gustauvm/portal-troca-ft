import { NextResponse } from "next/server";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { cancelPortalRequest } from "@/lib/requests/service";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: Context) {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await cancelPortalRequest(session, id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao cancelar a solicitação." },
      { status: 400 },
    );
  }
}
