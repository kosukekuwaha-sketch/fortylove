import { describe, expect, it } from "vitest";
import { findKnowledgeAnswer, formatEventAnswer, isEventQuestion, normalizeChatText } from "./chatbot";

const knowledge = [{
  id: "1", title: "初心者の参加", category: "参加条件", content: "初心者も歓迎しています。", keywords: ["初心者", "未経験", "テニス初めて"], priority: 10, is_active: true,
}];

describe("chatbot matching", () => {
  it("表記ゆれを正規化する", () => expect(normalizeChatText("テニス、 初心者！")).toBe("テニス初心者"));
  it("キーワードに合う知識を選ぶ", () => expect(findKnowledgeAnswer("テニス未経験でも大丈夫？", knowledge)?.id).toBe("1"));
  it("無関係な質問には回答しない", () => expect(findKnowledgeAnswer("会計担当者の電話番号は？", knowledge)).toBeNull());
  it("イベント質問を識別する", () => expect(isEventQuestion("次の新歓はいつ？")).toBe(true));
  it("参加条件の質問をイベント質問と誤判定しない", () => expect(isEventQuestion("新歓は初心者でも参加できますか？")).toBe(false));
  it("空席数には回答時点である旨を含める", () => {
    const answer = formatEventAnswer("まだ空きある？", { id: "e", title: "新歓練習", starts_at: "2026-09-10T06:00:00Z", ends_at: "2026-09-10T08:00:00Z", location: "早稲田コート", capacity: 10, description: null, reservations: [{ status: "reserved" }, { status: "cancelled" }] });
    expect(answer).toContain("あと9名");
    expect(answer).toContain("回答時点");
  });
});
