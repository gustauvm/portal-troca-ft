import { NextResponse } from "next/server";
import { getOperatorSession } from "@/lib/auth/operator";
import { deleteWhatsappRule, listWhatsappRules, upsertWhatsappRule } from "@/lib/whatsapp/rules";

export async function GET() {
  try {
    const operator = await getOperatorSession();
    if (!operator) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    const items = await listWhatsappRules(operator);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível listar regras." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const operator = await getOperatorSession();
    if (!operator) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    const item = await upsertWhatsappRule(operator, await request.json());
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar regra." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const operator = await getOperatorSession();
    if (!operator) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("Informe a regra.");
    const result = await deleteWhatsappRule(operator, id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível remover regra." },
      { status: 400 },
    );
  }
}
