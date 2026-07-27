import { createEvent } from "@/app/actions";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Events() {
  const { data } = await db().from("events").select("*,reservations(id,status,user:users(name))").order("starts_at", { ascending: false });
  return <section className="admin-page"><div className="page-title"><div><p className="eyebrow green">EVENTS</p><h1>イベント管理</h1><p>練習・イベントの作成と参加者確認ができます。</p></div></div>
    <details className="create-panel"><summary>＋ 新しいイベントを作成</summary><form action={createEvent} className="grid-form"><label>タイトル<input name="title" required /></label><label>場所<input name="location" required /></label><label>開始日時<input type="datetime-local" name="starts_at" required /></label><label>終了日時<input type="datetime-local" name="ends_at" required /></label><label>定員<input type="number" name="capacity" min="1" required /></label><label className="full">説明<textarea name="description" /></label><button className="primary full">イベントを作成</button></form></details>
    <div className="admin-cards">{data?.map(e => <article className="admin-event" key={e.id}><div><span className="event-chip">{new Date(e.starts_at).toLocaleDateString("ja-JP")}</span><h3>{e.title}</h3><p>{e.location}・{new Date(e.starts_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</p></div><div><strong>{e.reservations.filter((r: {status:string}) => r.status === "reserved").length}/{e.capacity}</strong><small>予約</small></div><details><summary>参加者を表示</summary><ul>{e.reservations.filter((r: {status:string}) => r.status === "reserved").map((r: {id:string,user:{name:string}}) => <li key={r.id}>{r.user?.name}</li>)}</ul></details></article>)}</div>
  </section>;
}
