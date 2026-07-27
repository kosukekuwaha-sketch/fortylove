import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateUserRole } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AdminRoleAssignmentForm } from "@/components/admin-role-assignment-form";

export const dynamic = "force-dynamic";

export default async function Administrators() {
  const session = await getSession();
  if (!session || session.role !== "super_admin") redirect("/admin");
  const { data: users } = await db().from("users").select("id,name,university,faculty,email,line_id,role,created_at").order("name");
  const data = users?.filter(user => user.role === "admin" || user.role === "super_admin");

  return <section className="admin-page">
    <div className="page-title"><div><p className="eyebrow green">ADMINISTRATORS</p><h1>管理者一覧</h1><p>この情報は最高情報責任者のみ閲覧できます。</p></div><span className="stat"><strong>{data?.length ?? 0}</strong>名</span></div>
    <details className="create-panel"><summary>＋ 管理者権限を付与</summary><AdminRoleAssignmentForm users={users?.filter(user => user.role === "member") ?? []} /></details>
    <div className="table-wrap"><table><thead><tr><th>氏名</th><th>権限属性</th><th>所属</th><th>連絡先</th><th>登録日</th></tr></thead><tbody>
      {data?.map(admin => <tr key={admin.id}><td><span className="table-name"><i>{admin.name[0]}</i>{admin.name}</span></td><td>{admin.id === session.id ? <strong>最高情報責任者（自分）</strong> : <form action={updateUserRole} className="inline-role-form"><input type="hidden" name="user_id" value={admin.id} /><select name="role" defaultValue={admin.role}><option value="member">一般ユーザー</option><option value="admin">管理者</option><option value="super_admin">最高情報責任者</option></select><ConfirmSubmitButton className="table-action" message={`${admin.name}さんの権限を変更しますか？`}>変更</ConfirmSubmitButton></form>}</td><td>{admin.university}・{admin.faculty}</td><td>{admin.email || "未登録"}<small>{admin.line_id && `LINE: ${admin.line_id}`}</small></td><td>{new Date(admin.created_at).toLocaleDateString("ja-JP")}</td></tr>)}
    </tbody></table>{!data?.length && <div className="empty"><p>管理者が登録されていません</p></div>}</div>
  </section>;
}
