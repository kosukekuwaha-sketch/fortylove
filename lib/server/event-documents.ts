import { db } from "@/lib/db";
import { EVENT_DOCUMENT_BUCKET, EVENT_DOCUMENT_MAX_BYTES, isAttachedEventDocumentPath, isOwnedEventDocumentUploadPath, isValidEventDocumentName } from "@/lib/event-document-policy";

export { EVENT_DOCUMENT_BUCKET } from "@/lib/event-document-policy";

const STAGING_TTL_MS = 24 * 60 * 60 * 1000;

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
  const attachedPath = `events/${eventId}/${crypto.randomUUID()}.pdf`;
  if (!isAttachedEventDocumentPath(attachedPath, eventId)) return "upload";
  const { error: moveError } = await client.storage.from(EVENT_DOCUMENT_BUCKET).move(path, attachedPath);
  if (moveError) return "upload";

  const { data: existing } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error: databaseError } = await client.from("event_documents").upsert({
    event_id: eventId,
    file_path: attachedPath,
    file_name: fileName,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id" });
  if (databaseError) {
    const { error: cleanupError } = await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([attachedPath]);
    if (cleanupError) console.error("Unattached event document cleanup failed", { path: attachedPath, message: cleanupError.message });
    return "database";
  }
  if (existing?.file_path && existing.file_path !== attachedPath) {
    await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([existing.file_path]);
  }
  return null;
}

export async function cleanupStaleEventDocumentUploads(now = new Date()) {
  const client = db();
  const bucket = client.storage.from(EVENT_DOCUMENT_BUCKET);
  const { data: actorFolders, error: folderError } = await bucket.list("uploads", { limit: 1000 });
  if (folderError) return { removed: 0, errors: 1 };

  const stalePaths: string[] = [];
  let errors = 0;
  const cutoff = now.getTime() - STAGING_TTL_MS;
  for (const folder of actorFolders ?? []) {
    if (!folder.name || folder.id) continue;
    const { data: files, error } = await bucket.list(`uploads/${folder.name}`, { limit: 1000 });
    if (error) {
      errors += 1;
      continue;
    }
    for (const file of files ?? []) {
      const timestamp = file.created_at ?? file.updated_at;
      const stagingPath = `uploads/${folder.name}/${file.name}`;
      const uploadedAt = timestamp ? new Date(timestamp).getTime() : Number.NaN;
      if (!isOwnedEventDocumentUploadPath(stagingPath, folder.name)
        || !Number.isFinite(uploadedAt)
        || uploadedAt > cutoff) continue;
      stalePaths.push(stagingPath);
    }
  }

  let removed = 0;
  for (let index = 0; index < stalePaths.length; index += 100) {
    const paths = stalePaths.slice(index, index + 100);
    const { error } = await bucket.remove(paths);
    if (error) errors += 1;
    else removed += paths.length;
  }
  return { removed, errors };
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
