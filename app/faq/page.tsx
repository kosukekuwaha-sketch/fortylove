import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { MemberNav } from "@/components/member-nav";
import { UserMenu } from "@/components/user-menu";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const [{ data: user }, { data: faqs }] = await Promise.all([
    client.from("users").select("name,avatar_url").eq("id", session.id).single(),
    client.from("faqs").select("id,question,answer,category").eq("is_published", true).order("sort_order").order("created_at"),
  ]);
  const categories = [...new Set((faqs ?? []).map((faq) => faq.category))];
  return <main className="member-shell faq-page">
    <header className="member-header"><Brand /><UserMenu name={user?.name ?? session.name} avatarUrl={user?.avatar_url} /></header>
    <section className="faq-hero"><p className="eyebrow green">HELP CENTER</p><h1>よくある質問</h1><p>練習・イベントや入会について、よくある質問をまとめています。</p></section>
    <section className="faq-content">
      {categories.map((category) => <section className="faq-category" key={category}><h2>{category}</h2><div className="faq-list">
        {faqs?.filter((faq) => faq.category === category).map((faq) => <details className="faq-item" key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
      </div></section>)}
      {!faqs?.length && <div className="empty"><p>現在、公開中のFAQはありません。</p></div>}
    </section>
    <MemberNav active="faq" />
  </main>;
}
