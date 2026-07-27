import { Search, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string; university?: string; page?: string }> }) {
  const { q = "", university = "", page = "1" } = await searchParams; const size = 20; const from = (Number(page) - 1) * size;
  let query = db().from("users").select("*", { count: "exact" }).eq("role", "member").range(from, from + size - 1).order("created_at", { ascending: false });
  if (q) query = query.ilike("name", `%${q}%`); if (university) query = query.eq("university", university);
  const { data, count } = await query;
  return <section className="admin-page"><div className="page-title"><div><p className="eyebrow green">MEMBERS</p><h1>新入生名簿</h1><p>登録者の情報を検索・確認できます。</p></div><span className="stat"><strong>{count ?? 0}</strong>名 登録中</span></div>
    <form className="filters"><div className="search"><Search /><input name="q" defaultValue={q} placeholder="名前で検索" /></div><select name="university" defaultValue={university}><option value="">すべての大学</option><option>早稲田大学</option><option>日本女子大学</option><option>東京女子大学</option></select><button className="dark">絞り込む</button></form>
    <div className="table-wrap"><table><thead><tr><th>氏名</th><th>大学</th><th>学部・学年</th><th>テニス経験</th><th>連絡先</th><th>登録日</th></tr></thead><tbody>{data?.map(m => <tr key={m.id}><td><span className="table-name"><i>{m.name[0]}</i>{m.name}</span></td><td>{m.university}</td><td>{m.faculty}・{m.grade}年</td><td>{m.tennis_experience || "未記入"}</td><td>{m.email || "未登録"}<small>{m.line_id && `LINE: ${m.line_id}`}</small></td><td>{new Date(m.created_at).toLocaleDateString("ja-JP")}</td></tr>)}</tbody></table>{!data?.length && <div className="empty"><UserPlus /><p>該当するメンバーはいません</p></div>}</div>
  </section>;
}
