"use client";

import { useState } from "react";
import { Bot, MessageCircle } from "lucide-react";
import { ChatbotPreview } from "./chatbot-preview";

export function ChatbotWidget({ mode }: { mode: "admin" | "member" }) {
  const [open, setOpen] = useState(false);
  return <div className={`chatbot-widget ${open ? "open" : ""}`}>
    {open && <div className="chatbot-widget-window"><ChatbotPreview mode={mode} onClose={() => setOpen(false)} /></div>}
    <span className="chatbot-widget-label">chatbotはこちら</span>
    <button className="chatbot-widget-button" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "チャットを閉じる" : "チャットを開く"} aria-expanded={open}><span>{open ? <Bot /> : <MessageCircle />}</span></button>
  </div>;
}
