export const EVENT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const EVENT_DOCUMENT_MAX_LABEL = "15MB";
export const EVENT_DOCUMENT_BUCKET = "event-documents";

export type EventDocumentValidationError = "type" | "size";

export function validateEventDocumentFile(file: { name: string; type: string; size: number }): EventDocumentValidationError | null {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return "type";
  if (file.size < 1 || file.size > EVENT_DOCUMENT_MAX_BYTES) return "size";
  return null;
}

export function isValidEventDocumentName(name: string) {
  return name.length > 0
    && name.length <= 255
    && name.toLowerCase().endsWith(".pdf")
    && !/[\\/\u0000-\u001f]/.test(name);
}

export function isOwnedEventDocumentUploadPath(path: string, actorId: string) {
  const prefix = `uploads/${actorId}/`;
  if (!path.startsWith(prefix)) return false;
  const objectName = path.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(objectName);
}

export function isAttachedEventDocumentPath(path: string, eventId: string) {
  const prefix = `events/${eventId}/`;
  if (!path.startsWith(prefix)) return false;
  const objectName = path.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(objectName);
}
