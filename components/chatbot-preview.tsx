"use client";

import { FormEvent, useState } from "react";
import { Bot, Send, ShieldCheck } from "lucide-react";

type Message = { role: "user" | "bot"; text: string; source?: string };

export function ChatbotPreview() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", text: "動作確認用チャットです。一般ユーザーにはまだ公開されていません。" }]);
  const [sending, setSending] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || sending) return;
    setMessages((current) => [...current, { role: "user", text: value }]);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/chatbot/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: value }) });
      const result = await response.json() as { answer?: string; source?: string; error?: string };
      setMessages((current) => [...current, { role: "bot", text: result.answer ?? result.error ?? "回答を取得できませんでした。", source: result.source }]);
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "通信に失敗しました。時間をおいてお試しください。" }]);
    } finally {
      setSending(false);
    }
  }

  return <section className="chatbot-preview" aria-labelledby="chatbot-preview-title">
    <header><span className="chatbot-icon"><Bot /></span><div><h2 id="chatbot-preview-title">動作確認チャット</h2><p><ShieldCheck />super_admin限定</p></div></header>
    <div className="chatbot-messages" aria-live="polite">{messages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}><p>{item.text}</p>{item.source && <small>根拠：{item.source}</small>}</div>)}{sending && <div className="chat-message bot"><p>回答を確認しています…</p></div>}</div>
    <form onSubmit={send}><label className="sr-only" htmlFor="chatbot-preview-input">質問</label><input id="chatbot-preview-input" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="例：次の新歓はいつ？" /><button type="submit" disabled={sending || !message.trim()} aria-label="送信"><Send /></button></form>
  </section>;
}
