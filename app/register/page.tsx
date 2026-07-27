import Link from "next/link";
import { Brand } from "@/components/brand";
import { UniversityFields } from "@/components/university-fields";
import { register } from "@/app/actions";

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="form-page"><header><Brand /><Link href="/login">ログインへ</Link></header>
    <section className="form-card"><p className="eyebrow green">JOIN COURTSIDE</p><h1>新規メンバー登録</h1><p className="muted">基本情報を入力すると、すぐに練習を予約できます。</p>
      {error && <div className="alert">{error === "duplicate" ? "同じ名前とパスワードの登録があります。別のパスワードを設定してください。" : error === "password" ? "パスワードは4文字以上で設定してください。" : "登録できませんでした。入力内容をご確認ください。"}</div>}
      <form action={register} className="grid-form">
        <label className="full">名前<input name="name" placeholder="山田 太郎" required /></label>
        <UniversityFields />
        <label>学年<select name="grade" required>{[1,2,3,4].map(x => <option key={x} value={x}>{x}年</option>)}</select></label>
        <label>メールアドレス（任意）<input name="email" type="email" placeholder="you@example.com" /></label>
        <label>LINE ID（任意）<input name="line_id" placeholder="line_id" /></label>
        <label className="full">テニス経験<textarea name="tennis_experience" placeholder="例：中学で軟式テニスを3年間、大学から硬式を始めたい など" /></label>
        <label>パスワード<input name="password" type="password" minLength={4} required /><small>数字のみでも設定できます（4文字以上）</small></label>
        <button className="primary full" type="submit">登録してはじめる</button>
      </form>
    </section>
  </main>;
}
