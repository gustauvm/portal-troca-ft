import { NextResponse } from "next/server";
import { z } from "zod";
import { getOperatorSession } from "@/lib/auth/operator";
import { reviewPortalRequest } from "@/lib/requests/service";

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
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
    const payload = reviewSchema.parse(await request.json());
    const { id } = await context.params;
    const result = await reviewPortalRequest({
      requestId: id,
      decision: payload.decision,
      note: payload.note,
      operatorUserId: operator.userId,
      operatorName: operator.fullName,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao revisar a solicitação." },
      { status: 400 },
    );
  }
}
