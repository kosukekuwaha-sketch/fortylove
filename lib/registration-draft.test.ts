import { describe, expect, it } from "vitest";
import { parseRegistrationDraft, registrationDraftFromFormData, sanitizeRegistrationDraft } from "./registration-draft";

describe("registration draft", () => {
  it("保存許可項目だけを残す", () => {
    expect(sanitizeRegistrationDraft({
      name: "山田 太郎",
      university_choice: "早稲田大学",
      password: "plain-password",
      temporary_password: "temporary-secret",
      token: "secret-token",
      unknown: "value",
    })).toEqual({ name: "山田 太郎", university_choice: "早稲田大学" });
  });

  it("旧形式の下書きから機密値を除去する", () => {
    const draft = parseRegistrationDraft(JSON.stringify({
      name: "山田 太郎",
      password: "plain-password",
      secret: "should-not-remain",
    }));
    const serialized = JSON.stringify(draft);
    expect(draft).toEqual({ name: "山田 太郎" });
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("plain-password");
    expect(serialized).not.toContain("should-not-remain");
  });

  it("フォームから許可項目だけを抽出する", () => {
    const formData = new FormData();
    formData.set("name", "山田 太郎");
    formData.set("grade", "2");
    formData.set("password", "plain-password");
    expect(registrationDraftFromFormData(formData)).toEqual({ name: "山田 太郎", grade: "2" });
  });

  it("壊れた旧データは空の下書きとして扱う", () => {
    expect(parseRegistrationDraft("{broken-json")).toEqual({});
  });
});
