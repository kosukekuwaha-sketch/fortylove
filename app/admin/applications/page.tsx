import { updateApplication } from "@/app/actions";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
const labels: Record<string,string> = { pending: "未承認", reviewing: "検討中", rejected: "拒否", approved: "入会済" };
export default async function Applications() {
  const { data } = await db().from("membership_applications").select("*,user:users(name,university,faculty,email)").order("applied_at", { ascending: false });
  return <section className="admin-page"><div className="page-title"><div><p className="eyebrow green">APPLICATIONS</p><h1>入会申請</h1><p>申請状況を確認・更新できます。</p></div></div><div className="table-wrap"><table><thead><tr><th>氏名</th><th>所属</th><th>申請日</th><th>ステータス</th></tr></thead><tbody>{data?.map(a => <tr key={a.id}><td>{a.user?.name}<small>{a.user?.email}</small></td><td>{a.user?.university}・{a.user?.faculty}</td><td>{new Date(a.applied_at).toLocaleDateString("ja-JP")}</td><td><form action={updateApplication}><input type="hidden" name="id" value={a.id}/><select name="status" defaultValue={a.status}>{Object.entries(labels).map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><button className="table-action">更新</button></form></td></tr>)}</tbody></table></div></section>;
}
