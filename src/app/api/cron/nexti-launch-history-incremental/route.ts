import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/cron/auth";
import { syncNextiLaunchHistory } from "@/lib/nexti/launch-history-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const result = await syncNextiLaunchHistory({
    mode: "incremental",
    start: searchParams.get("start"),
    finish: searchParams.get("finish"),
  });

  return NextResponse.json(result);
}
