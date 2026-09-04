import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { EVENT_DOCUMENT_MAX_BYTES, isValidEventDocumentName, validateEventDocumentFile } from "@/lib/event-document-policy";
import { createEventDocumentUpload } from "@/lib/server/event-documents";

const requestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(EVENT_DOCUMENT_MAX_BYTES),
  fileType: z.literal("application/pdf"),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = db();
  const { data: user } = await client.from("users").select("role").eq("id", session.id).maybeSingle();
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidEventDocumentName(parsed.data.fileName) || validateEventDocumentFile({
    name: parsed.data.fileName,
    type: parsed.data.fileType,
    size: parsed.data.fileSize,
  })) {
    return NextResponse.json({ error: "Invalid PDF" }, { status: 400 });
  }

  const result = await createEventDocumentUpload(session.id);
  if (!result) return NextResponse.json({ error: "Upload preparation failed" }, { status: 500 });
  return NextResponse.json(result);
}
