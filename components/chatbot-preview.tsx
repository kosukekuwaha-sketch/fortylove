"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Bot, Send, ShieldCheck, UserRoundCheck, X } from "lucide-react";

type ChatbotChoice = { id: string; label: string; title: string };
type Message = {
  role: "user" | "bot";
  text: string;
  source?: string;
  offerEscalation?: boolean;
  question?: string;
  decided?: boolean;
  choices?: ChatbotChoice[];
};

type ChatbotResponse = {
  answer?: string;
  source?: string;
  error?: string;
  offerEscalation?: boolean;
  choices?: ChatbotChoice[];
};

export function ChatbotPreview({ mode = "preview", onClose }: { mode?: "preview" | "admin" | "member"; onClose?: () => void }) {
  const titleId = useId();
  const inputId = useId();
  const messagesRef = useRef<HTMLDivElement>(null);
  const [inputName, setInputName] = useState("fortylove-chatbot-question");
  const [testAudience, setTestAudience] = useState<"admin" | "member">("member");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([{
    role: "bot",
    text: mode === "preview"
      ? "動作確認用チャットです。公開設定に関係なくいつでもテストできます。"
      : "Fortyloveについて知りたいことを質問してください。",
  }]);
  const [pendingChoices, setPendingChoices] = useState<ChatbotChoice[]>([]);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, sending, escalating]);

  useEffect(() => {
    setInputName(`fortylove-chatbot-question-${crypto.randomUUID()}`);
  }, []);

  async function requestAnswer(displayText: string, requestMessage = displayText, choiceId?: string) {
    if (!displayText.trim() || sending) return;
    setMessages((current) => [
      ...current.map((item) => item.choices ? { ...item, choices: undefined } : item),
      { role: "user", text: displayText },
    ]);
    setPendingChoices([]);
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/chatbot/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: requestMessage,
          ...(choiceId ? { choiceId } : {}),
          ...(mode === "preview" ? { audience: testAudience } : {}),
        }),
      });
      const result = await response.json() as ChatbotResponse;
      const choices = result.choices ?? [];
      setPendingChoices(choices);
      setMessages((current) => [...current, {
        role: "bot",
        text: result.answer ?? result.error ?? "回答を取得できませんでした。",
        source: result.source,
        offerEscalation: result.offerEscalation,
        question: requestMessage,
        choices,
      }]);
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "通信に失敗しました。時間をおいてお試しください。" }]);
    } finally {
      setSending(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    const selected = /^\d$/.test(value) ? pendingChoices[Number(value) - 1] : undefined;
    await requestAnswer(value, selected?.title ?? value, selected?.id);
  }

  function declineEscalation(index: number) {
    setMessages((current) => current
      .map((item, itemIndex) => itemIndex === index ? { ...item, decided: true } : item)
      .concat({ role: "bot", text: "承知しました。今回は管理者へ通知しません。" }));
  }

  async function requestEscalation(index: number, question: string) {
    if (escalating) return;
    setEscalating(true);
    try {
      const response = await fetch("/api/chatbot/preview/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const result = await response.json() as { message?: string; error?: string };
      setMessages((current) => current
        .map((item, itemIndex) => itemIndex === index ? { ...item, decided: true } : item)
        .concat({ role: "bot", text: result.message ?? result.error ?? "管理者へ通知できませんでした。" }));
    } catch {
      setMessages((current) => [...current, { role: "bot", text: "管理者へ通知できませんでした。時間をおいてお試しください。" }]);
    } finally {
      setEscalating(false);
    }
  }

  function changeTestAudience(audience: "admin" | "member") {
    setTestAudience(audience);
    setPendingChoices([]);
    setMessages([{
      role: "bot",
      text: `${audience === "admin" ? "管理者" : "一般ユーザー"}向けの参照元へ切り替えました。質問を入力してください。`,
    }]);
  }

  return <section className="chatbot-preview" aria-labelledby={titleId}>
    <header>
      <span className="chatbot-icon"><Bot /></span>
      <div>
        <h2 id={titleId}>{mode === "preview" ? "動作確認チャット" : "Fortylove チャットBot"}</h2>
        <p><ShieldCheck />{mode === "preview" ? "super_adminは常時テスト可能" : mode === "admin" ? "管理者向け" : "メンバー向け"}</p>
      </div>
      {onClose && <button className="chatbot-close" type="button" onClick={onClose} aria-label="チャットを閉じる"><X /></button>}
    </header>
    {mode === "preview" && <div className="chatbot-test-audience">
      <span>テスト対象</span>
      <div>
        <button type="button" className={testAudience === "admin" ? "active" : ""} onClick={() => changeTestAudience("admin")}>管理者</button>
        <button type="button" className={testAudience === "member" ? "active" : ""} onClick={() => changeTestAudience("member")}>一般ユーザー</button>
      </div>
    </div>}
    <div ref={messagesRef} className="chatbot-messages" aria-live="polite">
      {messages.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.role}-${index}`}>
        <p>{item.text}</p>
        {item.source && <small>根拠：{item.source}</small>}
        {!!item.choices?.length && <div className="chatbot-choice-list" aria-label="回答候補">
          {item.choices.map((choice) => <button
            type="button"
            key={choice.id}
            disabled={sending}
            onClick={() => requestAnswer(`${choice.label}. ${choice.title}`, choice.title, choice.id)}
          >
            <span>{choice.label}</span>{choice.title}
          </button>)}
          <small>ボタンを押すか、番号を入力してください。</small>
        </div>}
        {item.offerEscalation && !item.decided && <div className="escalation-choice">
          <strong><UserRoundCheck />有人対応を希望しますか？</strong>
          <div>
            <button type="button" onClick={() => requestEscalation(index, item.question ?? "")} disabled={escalating}>はい</button>
            <button type="button" onClick={() => declineEscalation(index)} disabled={escalating}>いいえ</button>
          </div>
          <small>「はい」を選んだ場合のみ、管理者の対応待ちへ登録されます。</small>
        </div>}
      </div>)}
      {sending && <div className="chat-message bot"><p>回答を確認しています…</p></div>}
    </div>
    <form onSubmit={send} autoComplete="off">
      <label className="sr-only" htmlFor={inputId}>質問</label>
      <input
        id={inputId}
        name={inputName}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={500}
        placeholder={pendingChoices.length ? "番号でも選べます（例：2）" : "例：次の新歓はいつ？"}
        autoComplete="new-password"
        aria-autocomplete="none"
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      <button type="submit" disabled={sending || !message.trim()} aria-label="送信"><Send /></button>
    </form>
    <p className="chatbot-privacy-note">個人情報は入力しないでください。回答生成が必要な場合、質問と選択されたMarkdown内容を外部AIサービス（Google Gemini）へ送信します。</p>
  </section>;
}
