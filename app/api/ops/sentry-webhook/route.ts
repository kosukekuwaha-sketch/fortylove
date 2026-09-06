import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deliverErrorAlert } from "@/lib/server/ops-notifications";

// Internal Integration issue-alert payload; the legacy unsigned webhook plugin is not accepted.
const payloadSchema = z.object({ action: z.literal("triggered"), data: z.object({ event: z.object({ event_id: z.string().regex(/^[a-f0-9]{32}$/i), project: z.union([z.string(), z.number()]) }) }) });
export async function POST(request: Request) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 262144) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 262144) { await reader.cancel(); return new Response(null, { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  const mac = request.headers.get("sentry-hook-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(mac) || !timingSafeEqual(Buffer.from(mac.toLowerCase()), Buffer.from(expected))) return new Response(null, { status: 401 });
  if (request.headers.get("sentry-hook-resource") !== "issue_alert") return new Response(null, { status: 204 });
  const parsed = payloadSchema.safeParse(await Promise.resolve().then(() => JSON.parse(raw.toString())).catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  if (!process.env.SENTRY_PROJECT_ID || String(parsed.data.data.event.project) !== process.env.SENTRY_PROJECT_ID) return new Response(null, { status: 403 });
  try {
    const status = await deliverErrorAlert(`sentry:${parsed.data.data.event.event_id}`);
    return NextResponse.json({ status });
  } catch { return NextResponse.json({ error: "Delivery unavailable; retry required" }, { status: 503 }); }
}
