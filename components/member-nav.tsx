import Link from "next/link";
import { Bot, CalendarDays, Home, UserRound } from "lucide-react";
export function MemberNav({ active, chatbotEnabled = false }: { active: "home" | "events" | "faq" | "profile" | "chatbot"; chatbotEnabled?: boolean }) {
  const links = <>
    <Link className={active === "home" ? "active" : ""} href="/home"><Home /><span>ホーム</span></Link>
    <Link className={active === "events" ? "active" : ""} href="/home#events"><CalendarDays /><span>イベント</span></Link>
    {chatbotEnabled && <Link className={active === "chatbot" ? "active" : ""} href="/chatbot"><Bot /><span>チャット</span></Link>}
    <Link className={active === "profile" ? "active" : ""} href="/profile"><UserRound /><span>プロフィール</span></Link>
  </>;
  const columns = chatbotEnabled ? 4 : 3;
  return <><nav className="member-tabs">{links}</nav><nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>{links}</nav></>;
}
