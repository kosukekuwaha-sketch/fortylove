import Link from "next/link";
import { Brand } from "./brand";
import { Archive, BadgeCheck, CalendarDays, CircleHelp, ClipboardList, LogOut, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { logout } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";
export function AdminNav({ role }: { role: "admin" | "super_admin" }) {
  return <aside className="admin-nav"><Brand /><nav><Link href="/admin"><UsersRound />登録者名簿</Link><Link href="/admin/members"><BadgeCheck />入会者リスト</Link><Link href="/admin/events"><CalendarDays />イベント</Link><Link href="/admin/faqs"><CircleHelp />FAQ管理</Link><Link href="/admin/applications"><ClipboardList />入会申請</Link>{role === "super_admin" && <Link href="/admin/admins"><ShieldCheck />管理者一覧</Link>}{role === "super_admin" && <Link href="/admin/withdrawals"><Archive />退会者台帳</Link>}<Link href="/admin/settings"><Settings />設定</Link></nav><form action={logout}><ConfirmSubmitButton message="ログアウトしますか？"><LogOut />ログアウト</ConfirmSubmitButton></form></aside>;
}
