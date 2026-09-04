import { describe, expect, it } from "vitest";
import { canUseChatbot } from "./chatbot-access";

describe("chatbot access", () => {
  it("super_adminは設定に関係なく利用できる", () => expect(canUseChatbot("super_admin", { chatbot_admin_enabled: false, chatbot_member_enabled: false })).toBe(true));
  it("adminは管理者向け設定に従う", () => {
    expect(canUseChatbot("admin", { chatbot_admin_enabled: true })).toBe(true);
    expect(canUseChatbot("admin", { chatbot_admin_enabled: false })).toBe(false);
  });
  it("memberはユーザー向け設定に従う", () => {
    expect(canUseChatbot("member", { chatbot_member_enabled: true })).toBe(true);
    expect(canUseChatbot("member", { chatbot_member_enabled: false })).toBe(false);
  });
});
