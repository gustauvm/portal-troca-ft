import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const updatePasswordSchema = z.object({
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export async function POST(request: Request) {
  try {
    const payload = updatePasswordSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: payload.password });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar a senha." },
      { status: 400 },
    );
  }
}
