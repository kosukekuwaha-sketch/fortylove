import Link from "next/link";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { login } from "@/app/actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-page">
    <section className="auth-art">
      <Brand />
      <div className="ball ball-one" /><div className="ball ball-two" />
      <div className="auth-message"><p className="eyebrow">WELCOME TO THE COURT</p><h1>最高の春を、<br />ここから。</h1><p>練習の予定も、仲間との出会いも。<br />新歓のすべてをひとつの場所で。</p></div>
    </section>
    <section className="auth-panel">
      <div className="auth-box"><div className="mobile-brand"><Brand /></div><p className="eyebrow green">MEMBER LOGIN</p><h2>おかえりなさい</h2><p className="muted">登録した名前とパスワードでログインしてください。</p>
        {error && <div className="alert">名前またはパスワードが違います。</div>}
        <form action={login}>
          <label>名前<div className="input-wrap"><UserRound /><input name="name" autoComplete="username" placeholder="山田 太郎" required /></div></label>
          <label>パスワード<div className="input-wrap"><LockKeyhole /><input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required /></div></label>
          <button className="primary" type="submit">ログイン <ArrowRight /></button>
        </form>
        <div className="divider"><span>初めての方</span></div>
        <Link className="secondary" href="/register">新規登録する</Link>
        <p className="help">パスワードを忘れた場合は、運営スタッフにお問い合わせください。</p>
      </div>
    </section>
  </main>;
}
