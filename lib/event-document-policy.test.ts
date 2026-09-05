import { describe, expect, it } from "vitest";
import { EVENT_DOCUMENT_MAX_BYTES, isAttachedEventDocumentPath, isOwnedEventDocumentUploadPath, isValidEventDocumentName, validateEventDocumentFile } from "./event-document-policy";

describe("event document policy", () => {
  it("上限ちょうどのPDFを許可する", () => {
    expect(validateEventDocumentFile({ name: "案内.pdf", type: "application/pdf", size: EVENT_DOCUMENT_MAX_BYTES })).toBeNull();
  });

  it("上限を1byte超えるPDFを拒否する", () => {
    expect(validateEventDocumentFile({ name: "案内.pdf", type: "application/pdf", size: EVENT_DOCUMENT_MAX_BYTES + 1 })).toBe("size");
  });

  it("拡張子とMIME typeの両方を検証する", () => {
    expect(validateEventDocumentFile({ name: "案内.txt", type: "application/pdf", size: 1024 })).toBe("type");
    expect(validateEventDocumentFile({ name: "案内.pdf", type: "text/plain", size: 1024 })).toBe("type");
  });

  it("発行先管理者が所有するランダムなアップロードパスだけを許可する", () => {
    const actorId = "8b536fca-7218-4c33-bf95-65f88be3375b";
    expect(isOwnedEventDocumentUploadPath(`uploads/${actorId}/a8972d31-4703-46a2-85e5-7a70c728c992.pdf`, actorId)).toBe(true);
    expect(isOwnedEventDocumentUploadPath("uploads/another-user/a8972d31-4703-46a2-85e5-7a70c728c992.pdf", actorId)).toBe(false);
    expect(isOwnedEventDocumentUploadPath(`uploads/${actorId}/../secret.pdf`, actorId)).toBe(false);
  });

  it("イベント固有の添付済みパスだけを許可する", () => {
    const eventId = "5409c596-3d08-4de0-b55d-d930efaef2a4";
    expect(isAttachedEventDocumentPath(`events/${eventId}/a8972d31-4703-46a2-85e5-7a70c728c992.pdf`, eventId)).toBe(true);
    expect(isAttachedEventDocumentPath("events/another-event/a8972d31-4703-46a2-85e5-7a70c728c992.pdf", eventId)).toBe(false);
    expect(isAttachedEventDocumentPath(`events/${eventId}/../secret.pdf`, eventId)).toBe(false);
  });

  it("保存用ファイル名からパス文字と制御文字を排除する", () => {
    expect(isValidEventDocumentName("新歓案内.pdf")).toBe(true);
    expect(isValidEventDocumentName("../新歓案内.pdf")).toBe(false);
    expect(isValidEventDocumentName("新歓案内\n.pdf")).toBe(false);
  });
});
