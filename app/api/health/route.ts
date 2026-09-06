import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isMonitorAuthorized } from "@/lib/server/monitor-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Public liveness never touches the database. Readiness is reserved for the external monitor.
  if (!request.headers.has("authorization")) return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  if (!isMonitorAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const startedAt = Date.now();
  let healthy = false;
  try {
    const { data, error } = await db().from("app_settings").select("id").eq("id", 1).abortSignal(AbortSignal.timeout(4000));
    healthy = !error && data?.length === 1;
  } catch { /* Configuration failures and network timeouts are degraded, never uncaught. */ }

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database: healthy ? "ok" : "unavailable",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
