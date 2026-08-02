import Link from "next/link";
import { Brand } from "@/components/brand";
import { UniversityFields } from "@/components/university-fields";
import { RegistrationDraftKeeper } from "@/components/registration-draft";
import { register } from "@/app/actions";

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="form-page"><header><Brand /><Link href="/login">ログインへ</Link></header>
    <section className="form-card"><p className="eyebrow green">JOIN Fortylove</p><h1>新歓受付登録</h1><p className="muted">基本情報を入力すると、すぐに練習を予約できます。</p>
      {error && <div className="alert">{error === "duplicate" ? "同じ名前とパスワードの登録があります。別のパスワードを設定してください。" : error === "password" ? "パスワードは4文字以上で設定してください。" : "登録できませんでした。入力内容をご確認ください。"}</div>}
      <form id="registration-form" action={register} className="grid-form">
        <RegistrationDraftKeeper />
        <label className="full">名前<input name="name" placeholder="山田 太郎" required /></label>
        <UniversityFields />
        <label>学年<select name="grade" required><option value="1">1年</option><option value="2">2年</option><option value="3">3年</option><option value="4">4年</option><option value="5">4年以上</option></select></label>
        <label>Instagram ID（任意）<input name="instagram_id" placeholder="@を除いて入力" autoComplete="off" /></label>
        <label>LINEの表示名（任意）<input name="line_display_name" placeholder="LINEで表示されている名前" autoComplete="off" /></label>
        <label className="full">テニス経験<textarea name="tennis_experience" placeholder="例：中学で軟式テニスを3年間、大学から硬式を始めたい など" /></label>
        <label>パスワード<input name="password" type="password" minLength={4} required /><small>数字のみでも設定できます（4文字以上）</small></label>
        <button className="primary full" type="submit">新歓受付に登録する</button>
      </form>
    </section>
  </main>;
}
