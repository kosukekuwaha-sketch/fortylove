import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";
import { MemberNav } from "@/components/member-nav";
export const dynamic = "force-dynamic";
export default async function Profile() {
  const session = await getSession(); if (!session) redirect("/login");
  const { data: user } = await db().from("users").select("*").eq("id", session.id).single();
  return <main className="member-shell"><header className="member-header"><Brand /></header><section className="profile-card"><div className="profile-avatar">{session.name[0]}</div><h1>{session.name}</h1><p>{user?.university}・{user?.faculty}・{user?.grade}年</p><dl><div><dt>メール</dt><dd>{user?.email}</dd></div><div><dt>LINE ID</dt><dd>{user?.line_id || "未登録"}</dd></div></dl><form action={logout}><button className="secondary">ログアウト</button></form></section><MemberNav active="profile" /></main>;
}
