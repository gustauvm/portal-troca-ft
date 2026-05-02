import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOperatorPasswordEmail } from "@/lib/auth/operator-access";

const requestPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(request: Request) {
  try {
    const payload = requestPasswordSchema.parse(await request.json());
    const result = await requestOperatorPasswordEmail(payload.email);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível enviar o link de senha." },
      { status: 400 },
    );
  }
}
