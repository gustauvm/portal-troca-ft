import { NextResponse } from "next/server";
import { z } from "zod";
import { getOperatorSession } from "@/lib/auth/operator";
import {
  assertOperatorIsAdmin,
  listOperatorAccess,
  revokeOperatorAccess,
  upsertOperatorAccess,
} from "@/lib/auth/operator-access";

const operatorSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().optional(),
  role: z.enum(["operator", "admin"]).default("operator"),
  canViewAll: z.boolean().default(true),
  canEditAll: z.boolean().default(true),
  viewGroupKeys: z.array(z.string()).default([]),
  editGroupKeys: z.array(z.string()).default([]),
  viewCompanyIds: z.array(z.coerce.number()).default([]),
  editCompanyIds: z.array(z.coerce.number()).default([]),
});

export async function GET() {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }
  try {
    assertOperatorIsAdmin(operator);
    const items = await listOperatorAccess();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Acesso negado." },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }
  try {
    assertOperatorIsAdmin(operator);
    const payload = operatorSchema.parse(await request.json());
    const item = await upsertOperatorAccess({
      ...payload,
      fullName: payload.fullName || null,
      actorUserId: operator.userId,
    });

    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar o acesso." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }
  try {
    assertOperatorIsAdmin(operator);
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || "";
    const item = await revokeOperatorAccess({
      email,
      actorUserId: operator.userId,
    });

    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível remover o acesso." },
      { status: 400 },
    );
  }
}
