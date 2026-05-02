import { NextResponse } from "next/server";
import { z } from "zod";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import { resolveSwapColleague } from "@/lib/directory/service";

const querySchema = z.object({
  enrolment: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      enrolment: searchParams.get("enrolment") || "",
    });
    const result = await resolveSwapColleague(session.employeeId, query.enrolment);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível consultar o RE." },
      { status: 400 },
    );
  }
}
