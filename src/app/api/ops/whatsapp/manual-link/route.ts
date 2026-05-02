import { NextResponse } from "next/server";
import { getOperatorSession } from "@/lib/auth/operator";
import { createManualWhatsappLink } from "@/lib/whatsapp/manual";

export async function POST(request: Request) {
  try {
    const operator = await getOperatorSession();
    if (!operator) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    const result = await createManualWhatsappLink(operator, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível abrir WhatsApp." },
      { status: 400 },
    );
  }
}
