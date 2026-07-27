import Link from "next/link";
import { Brand } from "./brand";
import { CalendarDays, ClipboardList, LogOut, Settings, UsersRound } from "lucide-react";
import { logout } from "@/app/actions";
export function AdminNav() {
  return <aside className="admin-nav"><Brand /><nav><Link href="/admin"><UsersRound />名簿管理</Link><Link href="/admin/events"><CalendarDays />イベント</Link><Link href="/admin/applications"><ClipboardList />入会申請</Link><Link href="/admin/settings"><Settings />設定</Link></nav><form action={logout}><button><LogOut />ログアウト</button></form></aside>;
}
