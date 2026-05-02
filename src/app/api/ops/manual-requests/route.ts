import { NextResponse } from "next/server";
import { getOperatorSession } from "@/lib/auth/operator";
import { createManualPortalRequest } from "@/lib/requests/service";

export async function POST(request: Request) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }

  try {
    const result = await createManualPortalRequest(operator, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível registrar o lançamento manual." },
      { status: 400 },
    );
  }
}
