import { FormFeedback } from "@/components/form-feedback";
import { updateRecruitingStatus } from "@/app/server-actions/settings-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/server/action-context";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ updated?: string; error?: string }> }) {
  await requireSuperAdmin();
  const { data: settings } = await db().from("app_settings").select("recruiting_open").eq("id", 1).maybeSingle();
  const recruitingOpen = settings?.recruiting_open ?? true;
  const { updated, error } = await searchParams;

  return <section className="admin-page"><div className="page-title"><div><p className="eyebrow green">SETTINGS</p><h1>運用設定</h1><p>新歓受付の公開状態を管理します。</p></div><span className="stat"><strong>{recruitingOpen ? "受付中" : "停止中"}</strong></span></div>
    {updated && <div className="success-message">{updated === "open" ? "新歓受付を再開しました。" : "新歓受付を停止しました。"}</div>}
    {error && <div className="alert">{error === "validation" ? "設定内容を確認してください。" : "受付状態を変更できませんでした。"}</div>}
    <div className="settings-card"><h2>新歓受付</h2><p>{recruitingOpen ? "現在、新入生からの新歓受付登録を受け付けています。" : "現在、新入生からの新歓受付登録を停止しています。"}</p>
      <form action={updateRecruitingStatus}><FormFeedback /><input type="hidden" name="recruiting_open" value={String(!recruitingOpen)} />
        {recruitingOpen
          ? <ConfirmSubmitButton className="danger" message="新歓受付を停止しますか？">新歓受付を停止する</ConfirmSubmitButton>
          : <ConfirmSubmitButton className="primary" message="新歓受付を再開しますか？">新歓受付を再開する</ConfirmSubmitButton>}
      </form>
      <small>この操作は最高管理者のみ実行でき、操作履歴が保存されます。</small>
    </div>
  </section>;
}
