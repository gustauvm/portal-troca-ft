import { NextResponse } from "next/server";
import { z } from "zod";
import { getEmployeeSession } from "@/lib/auth/employee-session";
import {
  listFtWorkplacesForEmployee,
  listValidShifts,
  listWorkplacesForEmployee,
  searchSwapCandidates,
} from "@/lib/directory/service";

const querySchema = z.object({
  type: z.enum(["swap", "ft"]).default("swap"),
  search: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    type: searchParams.get("type") || "swap",
    search: searchParams.get("search") || "",
  });

  const workplaces = query.type === "ft"
    ? await listFtWorkplacesForEmployee(session.employeeId)
    : await listWorkplacesForEmployee(session.employeeId);
  const candidates =
    query.type === "swap"
      ? await searchSwapCandidates(session.employeeId, query.search || "")
      : [];
  const shifts = query.type === "ft" ? await listValidShifts() : [];

  return NextResponse.json({
    workplaces,
    candidates,
    shifts,
  });
}
