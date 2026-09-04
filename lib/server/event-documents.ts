import { db } from "@/lib/db";
import { EVENT_DOCUMENT_BUCKET, EVENT_DOCUMENT_MAX_BYTES, isOwnedEventDocumentUploadPath, isValidEventDocumentName } from "@/lib/event-document-policy";

export { EVENT_DOCUMENT_BUCKET } from "@/lib/event-document-policy";

async function ensureEventDocumentBucket() {
  const client = db();
  const { data: bucket } = await client.storage.getBucket(EVENT_DOCUMENT_BUCKET);
  if (!bucket) {
    const { error } = await client.storage.createBucket(EVENT_DOCUMENT_BUCKET, {
      public: false,
      fileSizeLimit: EVENT_DOCUMENT_MAX_BYTES,
      allowedMimeTypes: ["application/pdf"],
    });
    return !error;
  }
  const { error } = await client.storage.updateBucket(EVENT_DOCUMENT_BUCKET, {
    public: false,
    fileSizeLimit: EVENT_DOCUMENT_MAX_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
  return !error;
}

export async function createEventDocumentUpload(actorId: string) {
  if (!await ensureEventDocumentBucket()) return null;
  const path = `uploads/${actorId}/${crypto.randomUUID()}.pdf`;
  const { data, error } = await db().storage.from(EVENT_DOCUMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return null;
  return { path, signedUrl: data.signedUrl };
}

export async function attachUploadedEventDocument(eventId: string, actorId: string, path: string, fileName: string) {
  if (!isOwnedEventDocumentUploadPath(path, actorId) || !isValidEventDocumentName(fileName)) return "upload";
  const client = db();
  const { data: uploaded, error: infoError } = await client.storage.from(EVENT_DOCUMENT_BUCKET).info(path);
  if (infoError || !uploaded || uploaded.contentType !== "application/pdf" || !uploaded.size || uploaded.size > EVENT_DOCUMENT_MAX_BYTES) {
    return uploaded?.size && uploaded.size > EVENT_DOCUMENT_MAX_BYTES ? "size" : "upload";
  }
  const { data: existing } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error: databaseError } = await client.from("event_documents").upsert({
    event_id: eventId,
    file_path: path,
    file_name: fileName,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id" });
  if (databaseError) return "database";
  if (existing?.file_path && existing.file_path !== path) {
    await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([existing.file_path]);
  }
  return null;
}

export async function removeUploadedEventDocument(path: string, actorId: string) {
  if (!isOwnedEventDocumentUploadPath(path, actorId)) return;
  await db().storage.from(EVENT_DOCUMENT_BUCKET).remove([path]);
}

export async function removeEventDocument(eventId: string) {
  const client = db();
  const { data } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error } = await client.from("event_documents").delete().eq("event_id", eventId);
  if (error) return false;
  if (data?.file_path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([data.file_path]);
  return true;
}
