import { NextResponse } from "next/server";
import { requireCronAuthorization } from "@/lib/cron/auth";
import { syncNextiDirectory } from "@/lib/nexti/directory-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const group = searchParams.get("group");
  const result = await syncNextiDirectory({
    group,
    reason: "cron",
  });

  return NextResponse.json(result);
}

export { handle as GET, handle as POST };
