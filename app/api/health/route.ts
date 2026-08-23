import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const { error } = await db().from("app_settings").select("id").limit(1);
  const status = error ? 503 : 200;

  if (error) {
    console.error("Health check database error", { code: error.code, message: error.message });
  }

  return NextResponse.json(
    {
      status: error ? "degraded" : "ok",
      database: error ? "unavailable" : "ok",
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
