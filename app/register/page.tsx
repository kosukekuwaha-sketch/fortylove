import Link from "next/link";
import { Brand } from "@/components/brand";
import { register } from "@/app/actions";

const universities = ["早稲田大学", "日本女子大学", "東京女子大学"];

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="form-page"><header><Brand /><Link href="/login">ログインへ</Link></header>
    <section className="form-card"><p className="eyebrow green">JOIN COURTSIDE</p><h1>新規メンバー登録</h1><p className="muted">基本情報を入力すると、すぐに練習を予約できます。</p>
      {error && <div className="alert">{error === "duplicate" ? "同じ名前とパスワードの登録があります。別のパスワードを設定してください。" : error === "password" ? "パスワードは4文字以上で設定してください。" : "登録できませんでした。入力内容をご確認ください。"}</div>}
      <form action={register} className="grid-form">
        <label className="full">名前<input name="name" placeholder="山田 太郎" required /></label>
        <label>大学<select name="university" required><option value="">選択してください</option>{universities.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>学部・学科<input name="faculty" placeholder="政治経済学部" required /></label>
        <label>学年<select name="grade" required>{[1,2,3,4].map(x => <option key={x} value={x}>{x}年</option>)}</select></label>
        <label>メールアドレス<input name="email" type="email" placeholder="you@example.com" required /></label>
        <label>LINE ID（任意）<input name="line_id" placeholder="line_id" /></label>
        <label>パスワード<input name="password" type="password" minLength={4} required /><small>数字のみでも設定できます（4文字以上）</small></label>
        <button className="primary full" type="submit">登録してはじめる</button>
      </form>
    </section>
  </main>;
}
