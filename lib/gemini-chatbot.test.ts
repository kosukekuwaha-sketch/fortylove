import { describe, expect, it, vi } from "vitest";
import { buildGroundedPrompt, generateGroundedAnswer } from "./gemini-chatbot";

const records = [{ id: "1", title: "初心者", content: "初心者も歓迎しています。", category: "参加条件", keywords: ["初心者"], priority: 0, is_active: true, source_name: "member.md" }];

describe("Gemini grounded chatbot", () => {
  it("プロンプトに質問とMarkdownの内容を含める", () => {
    const prompt = buildGroundedPrompt("未経験でも参加できますか？", records);
    expect(prompt).toContain("member.md");
    expect(prompt).toContain("初心者も歓迎しています。");
    expect(prompt).toContain("未経験でも参加できますか？");
  });

  it("複数FAQを統合するときも渡された回答だけを根拠にする", () => {
    const prompt = buildGroundedPrompt("初心者でもバイトと両立できますか？", [
      ...records,
      { ...records[0], id: "2", title: "参加頻度", content: "毎回の参加は必須ではありません。", keywords: ["参加頻度"] },
    ]);
    expect(prompt).toContain("初心者も歓迎しています。");
    expect(prompt).toContain("毎回の参加は必須ではありません。");
    expect(prompt).toContain("必ず __NO_ANSWER__ だけを返してください");
  });

  it("資料に答えがない応答は採用しない", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "__NO_ANSWER__" }] } }] }) });
    await expect(generateGroundedAnswer("質問", records, { config: { apiKey: "key" }, fetcher })).resolves.toBeNull();
  });

  it("根拠に基づく応答を返す", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "初心者も参加できます。" }] } }] }) });
    await expect(generateGroundedAnswer("質問", records, { config: { apiKey: "key" }, fetcher })).resolves.toBe("初心者も参加できます。");
  });
});
