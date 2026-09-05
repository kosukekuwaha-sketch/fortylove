import { afterEach, expect, it, vi } from "vitest";
import { allowsGeneralAnswer } from "./chatbot";
import { parseMarkdownKnowledge, validateMarkdownFiles } from "./markdown-knowledge";
import { issueGeneralTicket, verifyGeneralTicket } from "./server/general-answer-ticket";
import { embedTexts } from "./embeddings";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("1000件と1001件を切り捨てず計数する", () => {
  for (const count of [1000, 1001]) expect(parseMarkdownKnowledge(Array.from({ length: count }, (_, i) => `## 質問${i}\n回答です。`).join("\n"), "資料")).toHaveLength(count);
});
it("10ファイル・合計1MBの境界と重複名を検証する", () => {
  const files = Array.from({ length: 10 }, (_, i) => ({ name: `${i}.md`, size: 100000 }));
  expect(validateMarkdownFiles(files)).toBeNull();
  expect(validateMarkdownFiles([...files, { name: "11.md", size: 1 }])).not.toBeNull();
  expect(validateMarkdownFiles([{ name: "a.md", size: 1000001 }])).not.toBeNull();
  expect(validateMarkdownFiles([files[0], files[0]])).not.toBeNull();
});
it("一般回答でクラブ固有の判断を受け付けない", () => {
  expect(allowsGeneralAnswer("ラケットの選び方を教えて")).toBe(true);
  for (const question of ["Fortyloveのラケットの選び方", "テニスの持ち物と参加費", "来月の会費", "入会できますか"]) expect(allowsGeneralAnswer(question)).toBe(false);
});
it("一般回答の同意券は本人・対象・質問・有効期限を検証する", () => {
  vi.stubEnv("SESSION_SECRET", "test-only-long-secret");
  const ticket = issueGeneralTicket("member-a", "member", "テニスのルール");
  expect(verifyGeneralTicket(ticket,"member-a","member","テニスのルール")).toBe(true);
  expect(verifyGeneralTicket(ticket,"member-b","member","テニスのルール")).toBe(false);
  expect(verifyGeneralTicket(ticket,"member-a","admin","テニスのルール")).toBe(false);
  expect(verifyGeneralTicket(ticket,"member-a","member","別の質問")).toBe(false);
  expect(verifyGeneralTicket(ticket+"x","member-a","member","テニスのルール")).toBe(false);
});
it("Embedding生成の部分失敗を成功として扱わない", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [{ values: [1, 2] }] }), { status: 200 })));
  await expect(embedTexts(["資料"])).rejects.toThrow();
});
