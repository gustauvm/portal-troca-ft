import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/cron/auth";
import { syncNextiLaunchHistory } from "@/lib/nexti/launch-history-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MIN_BACKFILL_DATE = new Date("2025-01-01T00:00:00-03:00");

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start")
    ? new Date(`${searchParams.get("start")}T00:00:00-03:00`)
    : addDays(new Date(), -31);
  const safeStartDate = startDate < MIN_BACKFILL_DATE ? MIN_BACKFILL_DATE : startDate;
  const finishDate = searchParams.get("finish")
    ? new Date(`${searchParams.get("finish")}T23:59:59-03:00`)
    : addDays(safeStartDate, 31);
  const safeFinishDate =
    finishDate.getTime() - safeStartDate.getTime() > 29 * 24 * 60 * 60 * 1000
      ? addDays(safeStartDate, 29)
      : finishDate;

  const result = await syncNextiLaunchHistory({
    mode: "backfill",
    start: safeStartDate.toISOString(),
    finish: safeFinishDate.toISOString(),
  });

  return NextResponse.json({
    ...result,
    nextStart: toIsoDate(addDays(safeFinishDate, 1)),
  });
}
