import { redirect } from "next/navigation";
import { deleteWithdrawalRecords } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SelectAllCheckbox } from "@/components/select-all-checkbox";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Withdrawals({ searchParams }: { searchParams: Promise<{ deleted?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: currentUser } = await db().from("users").select("role").eq("id", session.id).single();
  if (currentUser?.role !== "super_admin") redirect("/admin");
  const { deleted, error } = await searchParams;
  const { data } = await db().from("membership_withdrawals").select("*").order("withdrawn_at", { ascending: false });

  return <section className="admin-page">
    <div className="page-title"><div><p className="eyebrow green">WITHDRAWAL ARCHIVE</p><h1>退会者台帳</h1><p>この情報は最高情報責任者のみ閲覧できます。</p></div><span className="stat"><strong>{data?.length ?? 0}</strong>名</span></div>
    {deleted && <div className="success-message">{deleted}件の退会者情報を完全削除しました。</div>}
    {error && <div className="alert">{error === "selection" ? "完全削除する退会者を選択してください。" : "退会者情報を削除できませんでした。"}</div>}
    <form id="bulk-withdrawal-delete" action={deleteWithdrawalRecords}>
      <div className="bulk-toolbar"><span>削除対象を複数選択できます</span><ConfirmSubmitButton className="danger table-withdraw" message="選択した退会者情報を台帳から完全に削除します。元に戻せません。実行しますか？">選択した情報を完全削除</ConfirmSubmitButton></div>
      <div className="table-wrap"><table><thead><tr><th className="check-column"><SelectAllCheckbox formId="bulk-withdrawal-delete" name="withdrawal_ids" /></th><th>氏名</th><th>所属</th><th>学年</th><th>連絡先</th><th>テニス経験</th><th>ラケット</th><th>退会方法</th><th>退会日時</th></tr></thead><tbody>
        {data?.map(person => <tr key={person.id}><td className="check-column"><input type="checkbox" name="withdrawal_ids" value={person.id} aria-label={`${person.name}を選択`} /></td><td>{person.name}</td><td>{person.university}・{person.faculty}<small>{person.department}</small></td><td>{Number(person.grade) >= 5 ? "4年以上" : `${person.grade}年`}</td><td>{person.email || "未登録"}<small>{person.line_id && `LINE: ${person.line_id}`}</small></td><td>{person.tennis_experience || "未記入"}</td><td>{person.has_racket ? "所持" : "未所持"}</td><td>{person.withdrawal_source === "self" ? "本人" : "管理者"}</td><td>{new Date(person.withdrawn_at).toLocaleString("ja-JP")}</td></tr>)}
      </tbody></table>{!data?.length && <div className="empty"><p>退会者はいません</p></div>}</div>
    </form>
  </section>;
}
