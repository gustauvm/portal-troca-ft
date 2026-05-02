import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/cron/auth";
import { reconcileNextiRequests } from "@/lib/nexti/request-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parsePositiveInteger(value: string | null) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function handle(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const result = await reconcileNextiRequests({
    requestId: searchParams.get("requestId"),
    group: searchParams.get("group"),
    limit: parsePositiveInteger(searchParams.get("limit")),
    start: searchParams.get("start"),
    finish: searchParams.get("finish"),
  });

  return NextResponse.json(result);
}

export { handle as GET, handle as POST };
