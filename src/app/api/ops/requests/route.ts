import { NextResponse } from "next/server";
import { getOperatorSession } from "@/lib/auth/operator";
import { listOperatorRequests } from "@/lib/requests/service";
import type { LaunchStatus, WorkflowStatus } from "@/lib/types";

export async function GET(request: Request) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Acesso operacional não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const data = await listOperatorRequests(
      {
        page: Number(searchParams.get("page") || 1),
        limit: Number(searchParams.get("limit") || 25),
        groupKey: searchParams.get("groupKey") || undefined,
        requestType: (searchParams.get("requestType") as "swap" | "ft" | null) || undefined,
        workflowStatus: (searchParams.get("workflowStatus") as WorkflowStatus | null) || undefined,
        launchStatus: (searchParams.get("launchStatus") as LaunchStatus | null) || undefined,
        payrollReference: searchParams.get("payrollReference") || undefined,
        companyId: searchParams.get("companyId") || undefined,
        careerId: searchParams.get("careerId") || undefined,
        scheduleId: searchParams.get("scheduleId") || undefined,
        shiftId: searchParams.get("shiftId") || undefined,
        workplaceId: searchParams.get("workplaceId") || undefined,
        search: searchParams.get("search") || undefined,
      },
      operator,
    );

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar a fila operacional." },
      { status: 400 },
    );
  }
}
