import { describe, expect, it, vi } from "vitest";
import { createEscalationEmailPayload, sendChatbotEscalationEmail } from "./chatbot-escalation-email";

const input = { recipient: "admin@example.com", question: "参加条件を教えてください", requesterName: "山田太郎", questionId: "question-id" };

describe("chatbot escalation email", () => {
  it("通知先が未設定なら外部APIを呼ばない", async () => {
    const fetcher = vi.fn();
    await expect(sendChatbotEscalationEmail({ ...input, recipient: null }, { config: { apiKey: "key", senderEmail: "from@example.com" }, fetcher })).resolves.toBe("recipient_not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("メール本文に利用者と質問を含める", () => {
    const payload = createEscalationEmailPayload(input, { senderEmail: "from@example.com", senderName: "Fortylove" });
    expect(payload.to).toEqual([{ email: "admin@example.com" }]);
    expect(payload.textContent).toContain("山田太郎");
    expect(payload.textContent).toContain("参加条件を教えてください");
  });

  it("Brevoが成功した場合は送信済みを返す", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    await expect(sendChatbotEscalationEmail(input, { config: { apiKey: "key", senderEmail: "from@example.com" }, fetcher })).resolves.toBe("sent");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
