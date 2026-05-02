import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createEmployeeSessionCookie,
  getEmployeeSessionCookieOptions,
} from "@/lib/auth/employee-session";
import { getEmployeeForLoginFresh } from "@/lib/directory/service";

const loginSchema = z.object({
  enrolment: z.string().trim().min(1),
  cpf: z.string().trim().min(11),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const employee = await getEmployeeForLoginFresh(body.enrolment, body.cpf);

    if (!employee) {
      return NextResponse.json(
        { error: "Colaborador não encontrado com a matrícula e CPF informados." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        groupKey: employee.groupKey,
        companyName: employee.companyName,
        careerName: employee.careerName,
      },
    });

    response.cookies.set(
      "portal_employee_session",
      createEmployeeSessionCookie({
        employeeId: employee.id,
        personExternalId: employee.personExternalId,
        groupKey: employee.groupKey,
        companyId: employee.companyId,
        careerId: employee.careerId,
        fullName: employee.fullName,
      }),
      getEmployeeSessionCookieOptions(),
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao validar o acesso." },
      { status: 400 },
    );
  }
}
