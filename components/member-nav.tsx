import Link from "next/link";
import { CalendarDays, Home, UserRound } from "lucide-react";
export function MemberNav({ active }: { active: "home" | "events" | "profile" }) {
  return <nav className="bottom-nav">
    <Link className={active === "home" ? "active" : ""} href="/home"><Home /><span>ホーム</span></Link>
    <Link className={active === "events" ? "active" : ""} href="/home#events"><CalendarDays /><span>イベント</span></Link>
    <Link className={active === "profile" ? "active" : ""} href="/profile"><UserRound /><span>プロフィール</span></Link>
  </nav>;
}
