import { NextResponse } from "next/server";
import { z } from "zod";
import { createOperatorSessionFromEmployeeLogin } from "@/lib/auth/operator-access";
import {
  createOperatorSessionCookie,
  getOperatorSessionCookieOptions,
} from "@/lib/auth/operator-session";

const loginSchema = z.object({
  enrolment: z.string().trim().min(1, "Informe sua matrícula/RE."),
  cpf: z.string().trim().min(11, "Informe seu CPF."),
});

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const operator = await createOperatorSessionFromEmployeeLogin(payload);
    const response = NextResponse.json({
      ok: true,
      operator: {
        fullName: operator.fullName,
        enrolment: operator.enrolment,
        role: operator.role,
      },
    });

    response.cookies.set(
      "portal_operator_session",
      createOperatorSessionCookie({
        employeeId: operator.employeeId,
        accessId: operator.accessId,
        authUserId: operator.userId,
        fullName: operator.fullName,
        enrolment: operator.enrolment,
        role: operator.role,
      }),
      getOperatorSessionCookieOptions(),
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao validar o acesso operacional." },
      { status: 401 },
    );
  }
}
