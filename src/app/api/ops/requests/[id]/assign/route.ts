import { NextResponse } from "next/server";
import { z } from "zod";
import { getOperatorSession } from "@/lib/auth/operator";
import { assignPortalRequest } from "@/lib/requests/service";

const assignSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }

  try {
    const payload = assignSchema.parse(await request.json());
    const { id } = await context.params;
    const result = await assignPortalRequest({
      requestId: id,
      operatorUserId: operator.userId,
      operatorName: operator.fullName,
      assignedByUserId: operator.userId,
      note: payload.note,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao assumir a solicitação." },
      { status: 400 },
    );
  }
}
