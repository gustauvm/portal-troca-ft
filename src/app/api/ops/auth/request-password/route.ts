import { NextResponse } from "next/server";
import { z } from "zod";
import { resetOperatorPasswordDirect } from "@/lib/auth/operator-access";

const requestPasswordSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  confirmation: z.string().min(8, "Confirme a senha."),
});

export async function POST(request: Request) {
  try {
    const payload = requestPasswordSchema.parse(await request.json());
    const result = await resetOperatorPasswordDirect(payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível trocar a senha." },
      { status: 400 },
    );
  }
}
