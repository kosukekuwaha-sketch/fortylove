import { deleteMemberAccount } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ActiveMembers() {
  const { data } = await db()
    .from("membership_applications")
    .select("id,applied_at,user:users(id,name,university,faculty,department,grade,email,line_id)")
    .eq("status", "approved")
    .order("applied_at", { ascending: false });

  return (
    <section className="admin-page">
      <div className="page-title">
        <div><p className="eyebrow green">ACTIVE MEMBERS</p><h1>入会者リスト</h1><p>現在入会中のメンバーを確認・管理できます。</p></div>
        <span className="stat"><strong>{data?.length ?? 0}</strong>名</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>氏名</th><th>所属</th><th>学年</th><th>連絡先</th><th>入会日</th><th>操作</th></tr></thead>
          <tbody>{data?.map((member) => {
            const person = Array.isArray(member.user) ? member.user[0] : member.user;
            return <tr key={member.id}>
              <td>{person?.name}</td>
              <td>{person?.university}・{person?.faculty}<small>{person?.department}</small></td>
              <td>{Number(person?.grade) >= 5 ? "4年以上" : `${person?.grade}年`}</td>
              <td>{person?.email || "未登録"}<small>{person?.line_id && `LINE: ${person.line_id}`}</small></td>
              <td>{new Date(member.applied_at).toLocaleDateString("ja-JP")}</td>
              <td><form action={deleteMemberAccount}><input type="hidden" name="user_id" value={person?.id} /><ConfirmSubmitButton className="danger table-withdraw" message={`${person?.name}さんのアカウントと予約情報を削除します。元に戻せません。実行しますか？`}>退会・削除</ConfirmSubmitButton></form></td>
            </tr>;
          })}</tbody>
        </table>
        {!data?.length && <div className="empty"><p>現在入会中のメンバーはいません</p></div>}
      </div>
    </section>
  );
}
