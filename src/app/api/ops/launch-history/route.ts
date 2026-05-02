import { NextResponse } from "next/server";
import { getOperatorSession } from "@/lib/auth/operator";
import { listOperatorLaunchHistory } from "@/lib/requests/service";

export async function GET(request: Request) {
  const operator = await getOperatorSession();
  if (!operator) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);

  const result = await listOperatorLaunchHistory(
    {
      page: Number(searchParams.get("page") || 1),
      limit: Number(searchParams.get("limit") || 25),
      groupKey: searchParams.get("groupKey") || undefined,
      requestType:
        searchParams.get("requestType") === "swap" || searchParams.get("requestType") === "ft"
          ? (searchParams.get("requestType") as "swap" | "ft")
          : undefined,
      payrollReference: searchParams.get("payrollReference") || undefined,
      companyId: searchParams.get("companyId") || undefined,
      careerId: searchParams.get("careerId") || undefined,
      scheduleId: searchParams.get("scheduleId") || undefined,
      shiftId: searchParams.get("shiftId") || undefined,
      workplaceId: searchParams.get("workplaceId") || undefined,
      search: searchParams.get("search") || undefined,
      includeInactive: searchParams.get("includeInactive") === "true",
    },
    operator,
  );

  return NextResponse.json(result);
}
