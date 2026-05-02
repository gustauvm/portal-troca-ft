import { NextResponse } from "next/server";
import { getOperatorSession } from "@/lib/auth/operator";
import { updatePortalRequestOperationStatus } from "@/lib/requests/service";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await updatePortalRequestOperationStatus(operator, id, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar o status operacional." },
      { status: 400 },
    );
  }
}
