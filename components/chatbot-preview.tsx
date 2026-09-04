"use client";

import { FormEvent, useId, useState } from "react";
import { Bot, Send, ShieldCheck, UserRoundCheck, X } from "lucide-react";

type Message = { role: "user" | "bot"; text: string; source?: string; offerEscalation?: boolean; question?: string; decided?: boolean };

export function ChatbotPreview({ mode = "preview", onClose }: { mode?: "preview" | "admin" | "member"; onClose?: () => void }) {
  const titleId = useId();
  const inputId = useId();
  const [testAudience, setTestAudience] = useState<"admin" | "member">("member");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", text: mode === "preview" ? "動作確認用チャットです。公開設定に関係なくいつでもテストできます。" : "Fortyloveについて知りたいことを質問してください。" }]);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || sending) return;
    setMessages((current) => [...current, { role: "user", text: value }]);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/chatbot/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: value, ...(mode === "preview" ? { audience: testAudience } : {}) }) });
      const result = await response.json() as { answer?: string; source?: string; error?: string; offerEscalation?: boolean };
      setMessages((current) => [...current, { role: "bot", text: result.answer ?? result.error ?? "回答を取得できませんでした。", source: result.source, offerEscalation: result.offerEscalation, question: value }]);
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "通信に失敗しました。時間をおいてお試しください。" }]);
    } finally {
      setSending(false);
    }
  }

  function declineEscalation(index: number) {
    setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, decided: true } : item).concat({ role: "bot", text: "承知しました。今回は管理者へ通知しません。" }));
  }

  async function requestEscalation(index: number, question: string) {
    if (escalating) return;
    setEscalating(true);
    try {
      const response = await fetch("/api/chatbot/preview/escalate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const result = await response.json() as { message?: string; error?: string };
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, decided: true } : item).concat({ role: "bot", text: result.message ?? result.error ?? "管理者へ通知できませんでした。" }));
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "管理者へ通知できませんでした。時間をおいてお試しください。" }]);
    } finally {
      setEscalating(false);
    }
  }

  function changeTestAudience(audience: "admin" | "member") {
    setTestAudience(audience);
    setMessages([{ role: "bot", text: `${audience === "admin" ? "管理者" : "一般ユーザー"}向けの参照元へ切り替えました。質問を入力してください。` }]);
  }

  return <section className="chatbot-preview" aria-labelledby={titleId}>
    <header><span className="chatbot-icon"><Bot /></span><div><h2 id={titleId}>{mode === "preview" ? "動作確認チャット" : "Fortylove チャットBot"}</h2><p><ShieldCheck />{mode === "preview" ? "super_adminは常時テスト可能" : mode === "admin" ? "管理者向け" : "メンバー向け"}</p></div>{onClose && <button className="chatbot-close" type="button" onClick={onClose} aria-label="チャットを閉じる"><X /></button>}</header>
    {mode === "preview" && <div className="chatbot-test-audience"><span>テスト対象</span><div><button type="button" className={testAudience === "admin" ? "active" : ""} onClick={() => changeTestAudience("admin")}>管理者</button><button type="button" className={testAudience === "member" ? "active" : ""} onClick={() => changeTestAudience("member")}>一般ユーザー</button></div></div>}
    <div className="chatbot-messages" aria-live="polite">{messages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}><p>{item.text}</p>{item.source && <small>根拠：{item.source}</small>}{item.offerEscalation && !item.decided && <div className="escalation-choice"><strong><UserRoundCheck />有人対応を希望しますか？</strong><div><button type="button" onClick={() => requestEscalation(index, item.question ?? "")} disabled={escalating}>はい</button><button type="button" onClick={() => declineEscalation(index)} disabled={escalating}>いいえ</button></div><small>「はい」を選んだ場合のみ、管理者の対応待ちへ登録されます。</small></div>}</div>)}{sending && <div className="chat-message bot"><p>回答を確認しています…</p></div>}</div>
    <form onSubmit={send}><label className="sr-only" htmlFor={inputId}>質問</label><input id={inputId} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="例：次の新歓はいつ？" /><button type="submit" disabled={sending || !message.trim()} aria-label="送信"><Send /></button></form>
  </section>;
}
