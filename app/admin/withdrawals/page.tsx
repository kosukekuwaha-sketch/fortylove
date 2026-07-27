import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Withdrawals() {
  const session = await getSession();
  if (!session || session.role !== "super_admin") redirect("/admin");
  const { data } = await db().from("membership_withdrawals").select("*").order("withdrawn_at", { ascending: false });

  return <section className="admin-page">
    <div className="page-title"><div><p className="eyebrow green">WITHDRAWAL ARCHIVE</p><h1>退会者台帳</h1><p>この情報は最高情報責任者のみ閲覧できます。</p></div><span className="stat"><strong>{data?.length ?? 0}</strong>名</span></div>
    <div className="table-wrap"><table><thead><tr><th>氏名</th><th>所属</th><th>学年</th><th>連絡先</th><th>テニス経験</th><th>ラケット</th><th>退会方法</th><th>退会日時</th></tr></thead><tbody>
      {data?.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.university}・{person.faculty}<small>{person.department}</small></td><td>{Number(person.grade) >= 5 ? "4年以上" : `${person.grade}年`}</td><td>{person.email || "未登録"}<small>{person.line_id && `LINE: ${person.line_id}`}</small></td><td>{person.tennis_experience || "未記入"}</td><td>{person.has_racket ? "所持" : "未所持"}</td><td>{person.withdrawal_source === "self" ? "本人" : "管理者"}</td><td>{new Date(person.withdrawn_at).toLocaleString("ja-JP")}</td></tr>)}
    </tbody></table>{!data?.length && <div className="empty"><p>退会者はいません</p></div>}</div>
  </section>;
}
