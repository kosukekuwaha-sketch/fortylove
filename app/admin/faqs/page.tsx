import { answerSubmittedQuestion, createFaq, createFaqCategory, deleteFaq, deleteFaqCategory, dismissSubmittedQuestion, updateFaq } from "@/app/faq-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminFaqs({ searchParams }: {
  searchParams: Promise<{ created?: string; updated?: string; deleted?: string; answered?: string; dismissed?: string; category_created?: string; category_deleted?: string; error?: string }>;
}) {
  const { created, updated, deleted, answered, dismissed, category_created, category_deleted, error } = await searchParams;
  const [{ data: faqs }, { data: categories }, { data: submittedQuestions }] = await Promise.all([
    db().from("faqs").select("*").order("sort_order").order("created_at"),
    db().from("faq_categories").select("*").order("sort_order").order("name"),
    db().from("faq_questions").select("id,question,created_at,user:users(name)").eq("status", "pending").order("created_at"),
  ]);
  const completed = answered ? "質問へ回答し、FAQへ追加しました。" : dismissed ? "質問を非公開で処理済みにしました。" : created ? "FAQを追加しました。" : updated ? "FAQを更新しました。" : deleted ? "FAQを削除しました。" : category_created ? "カテゴリを追加しました。" : category_deleted ? "カテゴリを削除しました。" : "";
  return <section className="admin-page">
    <div className="page-title"><div><p className="eyebrow green">FAQ MANAGEMENT</p><h1>FAQ管理</h1><p>一般ユーザーのFAQタブに表示する内容を管理します。</p></div><span className="stat"><strong>{faqs?.length ?? 0}</strong>件</span></div>
    {completed && <div className="success-message">{completed}</div>}
    {error && <div className="alert">{error === "category-used" ? "使用中のカテゴリは削除できません。先にFAQのカテゴリを変更してください。" : "処理できませんでした。入力内容とSupabaseの設定をご確認ください。"}</div>}
    <section className="faq-inbox"><div className="faq-inbox-heading"><div><p className="eyebrow green">QUESTION INBOX</p><h2>新歓生からの質問</h2></div><span>{submittedQuestions?.length ?? 0}件</span></div>
      <div className="faq-inbox-list">{submittedQuestions?.map((submission) => {
        const submitter = Array.isArray(submission.user) ? submission.user[0] : submission.user;
        return <article key={submission.id}><div className="faq-submission-meta"><strong>{submitter?.name ?? "削除済みユーザー"}</strong><time>{new Date(submission.created_at).toLocaleString("ja-JP")}</time></div><form action={answerSubmittedQuestion} className="faq-admin-form"><input type="hidden" name="submission_id" value={submission.id} /><label>カテゴリ<select name="category" required><option value="">選択してください</option>{categories?.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label>表示順<input name="sort_order" type="number" defaultValue="0" /></label><label className="full">質問<input name="question" defaultValue={submission.question} required /></label><label className="full">回答<textarea name="answer" required /></label><label>公開状態<select name="is_published" defaultValue="true"><option value="true">公開</option><option value="false">下書き</option></select></label><button className="primary">回答してFAQへ追加</button></form><form action={dismissSubmittedQuestion}><input type="hidden" name="submission_id" value={submission.id} /><ConfirmSubmitButton className="danger table-withdraw" message="この質問を公開せず処理済みにしますか？">公開せず処理済みにする</ConfirmSubmitButton></form></article>;
      })}{!submittedQuestions?.length && <div className="empty"><p>未回答の質問はありません。</p></div>}</div>
    </section>
    <details className="create-panel"><summary>＋ カテゴリを管理</summary>
      <form action={createFaqCategory} className="faq-category-form"><label>カテゴリ名<input name="name" placeholder="例：アクセス・集合場所" required /></label><label>表示順<input name="sort_order" type="number" defaultValue="0" /></label><button className="primary">カテゴリを追加</button></form>
      <div className="faq-category-chips">{categories?.map((category) => <span key={category.id}>{category.name}<form action={deleteFaqCategory}><input type="hidden" name="category_id" value={category.id} /><input type="hidden" name="category_name" value={category.name} /><ConfirmSubmitButton message={`カテゴリ「${category.name}」を削除しますか？`}>×</ConfirmSubmitButton></form></span>)}</div>
    </details>
    <details className="create-panel"><summary>＋ 新しいFAQを追加</summary><form action={createFaq} className="faq-admin-form">
      <label>カテゴリ<select name="category" required><option value="">選択してください</option>{categories?.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label>表示順<input name="sort_order" type="number" defaultValue="0" /></label>
      <label className="full">質問<input name="question" required /></label><label className="full">回答<textarea name="answer" required /></label>
      <label>公開状態<select name="is_published" defaultValue="true"><option value="true">公開</option><option value="false">下書き</option></select></label><button className="primary">追加する</button>
    </form></details>
    <div className="faq-admin-list">{faqs?.map((faq) => <article className="faq-admin-card" key={faq.id}>
      <form action={updateFaq} className="faq-admin-form"><input type="hidden" name="faq_id" value={faq.id} />
        <label>カテゴリ<select name="category" defaultValue={faq.category} required>{!categories?.some((category) => category.name === faq.category) && <option value={faq.category}>{faq.category}</option>}{categories?.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label>表示順<input name="sort_order" type="number" defaultValue={faq.sort_order} /></label>
        <label className="full">質問<input name="question" defaultValue={faq.question} required /></label><label className="full">回答<textarea name="answer" defaultValue={faq.answer} required /></label>
        <label>公開状態<select name="is_published" defaultValue={String(faq.is_published)}><option value="true">公開</option><option value="false">下書き</option></select></label><button className="dark">変更を保存</button>
      </form>
      <form action={deleteFaq} className="faq-delete-form"><input type="hidden" name="faq_id" value={faq.id} /><ConfirmSubmitButton className="danger table-withdraw" message={`「${faq.question}」を削除しますか？元に戻せません。`}>削除</ConfirmSubmitButton></form>
    </article>)}{!faqs?.length && <div className="empty"><p>FAQはまだ登録されていません。</p></div>}</div>
  </section>;
}
