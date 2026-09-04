import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleEventDocumentUploads } from "@/lib/server/event-documents";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupStaleEventDocumentUploads();
  if (result.errors > 0) {
    return NextResponse.json({ error: "Storage cleanup was incomplete", ...result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
