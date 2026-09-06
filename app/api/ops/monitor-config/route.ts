import { NextResponse } from "next/server";
import { readNotificationSettings } from "@/lib/server/ops-notifications";
import { isMonitorAuthorized } from "@/lib/server/monitor-auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!isMonitorAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const settings = await readNotificationSettings();
    return NextResponse.json({ email: settings.email, enabled: settings.health_enabled, revision: settings.updated_at }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
