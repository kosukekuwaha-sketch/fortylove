import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout, updateRacketStatus } from "@/app/actions";
import { Brand } from "@/components/brand";
import { MemberNav } from "@/components/member-nav";

export const dynamic = "force-dynamic";

export default async function Profile({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { saved, error } = await searchParams;
  const { data: user } = await db().from("users").select("*").eq("id", session.id).single();
  return <main className="member-shell">
    <header className="member-header"><Brand /></header>
    <section className="profile-card">
      <div className="profile-avatar">{session.name[0]}</div>
      <h1>{session.name}</h1>
      <p>{user?.university}・{user?.faculty}・{user?.grade}年</p>
      {saved && <div className="success-message">ラケット情報を更新しました。</div>}
      {error && <div className="alert">更新できませんでした。もう一度お試しください。</div>}
      <dl>
        <div><dt>メール</dt><dd>{user?.email || "未登録"}</dd></div>
        <div><dt>LINE ID</dt><dd>{user?.line_id || "未登録"}</dd></div>
        <div><dt>テニス経験</dt><dd>{user?.tennis_experience || "未記入"}</dd></div>
      </dl>
      <form action={updateRacketStatus} className="profile-status">
        <label>ラケットの所持状況
          <select name="has_racket" defaultValue={String(user?.has_racket ?? false)}>
            <option value="true">所持している</option>
            <option value="false">所持していない</option>
          </select>
        </label>
        <button className="primary">所持状況を保存</button>
      </form>
      <form action={logout}><button className="secondary">ログアウト</button></form>
    </section>
    <MemberNav active="profile" />
  </main>;
}
