import { Bot, Database, FileText, Plus, Sparkles, Upload } from "lucide-react";
import { redirect } from "next/navigation";
import { createChatbotKnowledge, deleteChatbotKnowledge, importChatbotMarkdown, updateChatbotKnowledge } from "@/app/chatbot-actions";
import { ChatbotPreview } from "@/components/chatbot-preview";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChatbotAdmin({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; deleted?: string; imported?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const { data: currentUser } = await client.from("users").select("role").eq("id", session.id).single();
  if (currentUser?.role !== "super_admin") redirect("/admin");
  const [{ data: knowledge, error: knowledgeError }, { count: upcomingEvents }] = await Promise.all([
    client.from("chatbot_knowledge").select("*").order("priority", { ascending: false }).order("updated_at", { ascending: false }),
    client.from("events").select("*", { count: "exact", head: true }).gte("ends_at", new Date().toISOString()),
  ]);
  const { created, updated, deleted, imported, error } = await searchParams;
  const completed = imported !== undefined ? `${imported}件の回答データをMarkdownから下書きとして取り込みました。` : created ? "回答データを追加しました。" : updated ? "回答データを更新しました。" : deleted ? "回答データを削除しました。" : "";

  return <section className="admin-page chatbot-admin-page">
    <div className="page-title"><div><p className="eyebrow green">CHATBOT LAB</p><h1>チャットBot</h1><p>一般公開前に、回答データの整備と動作確認を行います。</p></div><span className="stat"><strong>{knowledge?.filter((item) => item.is_active).length ?? 0}</strong>件 有効</span></div>
    <div className="chatbot-draft-banner"><ShieldIcon /><div><strong>現在は非公開です</strong><p>この画面とテスト用チャットはsuper_adminだけが利用できます。</p></div></div>
    {completed && <div className="success-message">{completed}</div>}
    {knowledgeError && <div className="alert">Bot回答データ用のテーブルがまだありません。追加マイグレーションをSupabaseへ適用してください。</div>}
    {error && <div className="alert">{error === "validation" ? "入力内容を確認してください。キーワードは1〜20件必要です。" : error === "markdown-file" ? "512KB以下のMarkdown（.md）ファイルを選択してください。" : error === "markdown-empty" ? "回答データとして取り込める文章がありませんでした。" : error === "markdown-import" ? "Markdownを取り込めませんでした。追加マイグレーションをご確認ください。" : "回答データを保存できませんでした。Supabaseのマイグレーションをご確認ください。"}</div>}
    <div className="chatbot-workspace"><ChatbotPreview /><aside className="chatbot-sources"><h2>現在の回答元</h2><div><Database /><span><strong>{knowledge?.filter((item) => item.is_active).length ?? 0}件</strong>Bot回答データ</span></div><div><Sparkles /><span><strong>{upcomingEvents ?? 0}件</strong>今後のイベント</span></div><small>FAQは十分に整うまで回答元に含めません。</small></aside></div>
    <section className="markdown-import-panel"><div className="markdown-import-copy"><span className="chatbot-icon"><FileText /></span><div><h2>Markdownから取り込む</h2><p>見出しごとに分割し、確認待ちの下書きとして保存します。</p></div></div><form action={importChatbotMarkdown}><label className="markdown-file-input"><Upload /><span><strong>.mdファイルを選択</strong><small>UTF-8・最大512KB</small></span><input name="markdown_file" type="file" accept=".md,text/markdown,text/plain" required /></label><button className="dark">下書きとして取り込む</button></form><details className="markdown-format-help"><summary>推奨する書き方</summary><pre>{`# 参加条件\n## 初心者でも参加できますか？\n初心者の方も歓迎しています。\nキーワード: 初心者、未経験、テニス初めて`}</pre></details></section>
    <details className="create-panel chatbot-create-panel"><summary><Plus /> 1件ずつ回答データを追加</summary><KnowledgeForm action={createChatbotKnowledge} /></details>
    <div className="knowledge-heading"><div><p className="eyebrow green">KNOWLEDGE BASE</p><h2>Bot回答データ</h2></div><span>{knowledge?.length ?? 0}件</span></div>
    <div className="knowledge-list">{knowledge?.map((item) => <article className="knowledge-card" key={item.id}><details><summary><div><span className={`knowledge-status ${item.is_active ? "active" : "inactive"}`}>{item.is_active ? "回答に使用" : "停止中"}</span><h3>{item.title}</h3><p>{item.category} ・ 優先度 {item.priority}{item.source_name ? ` ・ ${item.source_name}` : ""}</p></div><span>編集</span></summary><KnowledgeForm action={updateChatbotKnowledge} item={item} /><form action={deleteChatbotKnowledge} className="knowledge-delete"><input type="hidden" name="knowledge_id" value={item.id} /><ConfirmSubmitButton className="danger" message={`「${item.title}」を削除しますか？`}>削除する</ConfirmSubmitButton></form></details></article>)}{!knowledge?.length && <div className="empty knowledge-empty"><Bot /><p>回答データはまだありません。</p><small>上の「回答データを追加」から登録できます。</small></div>}</div>
  </section>;
}

function ShieldIcon() { return <span className="chatbot-icon"><Bot /></span>; }

function KnowledgeForm({ action, item }: { action: (formData: FormData) => Promise<void>; item?: { id: string; title: string; content: string; category: string; keywords: string[]; priority: number; is_active: boolean } }) {
  return <form action={action} className="knowledge-form">{item && <input type="hidden" name="knowledge_id" value={item.id} />}<label>タイトル<input name="title" defaultValue={item?.title} maxLength={100} placeholder="例：初心者の参加について" required /></label><label>カテゴリ<input name="category" defaultValue={item?.category ?? "基本情報"} maxLength={50} placeholder="例：参加条件" required /></label><label className="full">回答内容<textarea name="content" defaultValue={item?.content} maxLength={2000} placeholder="利用者へ返す正確な回答を入力してください" required /></label><label className="full">検索キーワード<textarea className="keyword-input" name="keywords" defaultValue={item?.keywords.join("、")} placeholder="初心者、未経験、テニス初めて（読点または改行で区切る）" required /></label><label>優先度<input name="priority" type="number" min="0" max="100" defaultValue={item?.priority ?? 0} /></label><label>回答への使用<select name="is_active" defaultValue={String(item?.is_active ?? true)}><option value="true">使用する</option><option value="false">停止する</option></select></label><button className="primary">{item ? "変更を保存" : "回答データを追加"}</button></form>;
}
