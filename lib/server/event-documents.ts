import { db } from "@/lib/db";

export const EVENT_DOCUMENT_BUCKET = "event-documents";
const MAX_EVENT_PDF_SIZE = 15 * 1024 * 1024;

export async function replaceEventDocument(eventId: string, actorId: string, file: File) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return "type";
  if (file.size > MAX_EVENT_PDF_SIZE) return "size";
  const client = db();
  const { data: bucket } = await client.storage.getBucket(EVENT_DOCUMENT_BUCKET);
  if (!bucket) {
    const { error } = await client.storage.createBucket(EVENT_DOCUMENT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_EVENT_PDF_SIZE,
      allowedMimeTypes: ["application/pdf"],
    });
    if (error) return "upload";
  }
  const { data: existing } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const path = `${eventId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await client.storage.from(EVENT_DOCUMENT_BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (uploadError) return "upload";
  const { error: databaseError } = await client.from("event_documents").upsert({
    event_id: eventId,
    file_path: path,
    file_name: file.name,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id" });
  if (databaseError) {
    await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([path]);
    return "database";
  }
  if (existing?.file_path && existing.file_path !== path) {
    await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([existing.file_path]);
  }
  return null;
}

export async function removeEventDocument(eventId: string) {
  const client = db();
  const { data } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error } = await client.from("event_documents").delete().eq("event_id", eventId);
  if (error) return false;
  if (data?.file_path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([data.file_path]);
  return true;
}
