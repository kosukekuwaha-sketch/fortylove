import { Bot, Database, FileText, Mail, Power, Sparkles, Upload } from "lucide-react";
import { redirect } from "next/navigation";
import { deleteChatbotMarkdownSource, importChatbotMarkdown, updateChatbotEscalationEmail, updateChatbotStatus } from "@/app/chatbot-actions";
import { ChatbotPreview } from "@/components/chatbot-preview";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type KnowledgeRow = { id: string; source_name: string | null; updated_at: string };

export default async function ChatbotAdmin({ searchParams }: { searchParams: Promise<{ imported?: string; source_deleted?: string; email_updated?: string; status_updated?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const { data: currentUser } = await client.from("users").select("role").eq("id", session.id).single();
  if (currentUser?.role !== "super_admin") redirect("/admin");

  const [{ data: knowledgeData, error: knowledgeError }, { count: upcomingEvents }, { data: settings }] = await Promise.all([
    client.from("chatbot_knowledge").select("id,source_name,updated_at").eq("source_type", "markdown").order("updated_at", { ascending: false }),
    client.from("events").select("*", { count: "exact", head: true }).gte("ends_at", new Date().toISOString()),
    client.from("app_settings").select("chatbot_enabled,chatbot_escalation_email").eq("id", 1).maybeSingle(),
  ]);
  const knowledge = (knowledgeData ?? []) as KnowledgeRow[];
  const sourceMap = new Map<string, { name: string; count: number; updatedAt: string }>();
  for (const item of knowledge) {
    if (!item.source_name) continue;
    const source = sourceMap.get(item.source_name);
    if (source) source.count += 1;
    else sourceMap.set(item.source_name, { name: item.source_name, count: 1, updatedAt: item.updated_at });
  }
  const sources = [...sourceMap.values()];
  const chatbotEnabled = settings?.chatbot_enabled ?? false;
  const { imported, source_deleted: sourceDeleted, email_updated: emailUpdated, status_updated: statusUpdated, error } = await searchParams;
  const completed = statusUpdated
    ? `チャットBotを${statusUpdated === "started" ? "開始" : "停止"}しました。`
    : emailUpdated
      ? "有人対応の通知先メールアドレスを保存しました。"
      : sourceDeleted
        ? "Markdownと回答データを削除しました。"
        : imported !== undefined
          ? `${imported}件の回答データをMarkdownから反映しました。`
          : "";

  return <section className="admin-page chatbot-admin-page">
    <div className="page-title"><div><p className="eyebrow green">CHATBOT LAB</p><h1>チャットBot</h1><p>Markdownで回答内容を管理し、公開前の動作を確認します。</p></div><span className="stat"><strong>{chatbotEnabled ? "稼働中" : "停止中"}</strong></span></div>
    <div className="chatbot-draft-banner"><span className="chatbot-icon"><Bot /></span><div><strong>現在は一般ユーザーには非公開です</strong><p>この画面とテスト用チャットはsuper_adminだけが利用できます。</p></div></div>
    {completed && <div className="success-message">{completed}</div>}
    {knowledgeError && <div className="alert">Bot回答データ用のテーブルがまだありません。追加マイグレーションをSupabaseへ適用してください。</div>}
    {error && <div className="alert">{errorMessage(error)}</div>}

    <section className="chatbot-status-panel"><div><span className={`knowledge-status ${chatbotEnabled ? "active" : "inactive"}`}>{chatbotEnabled ? "稼働中" : "停止中"}</span><h2>チャットBotの稼働状態</h2><p>{chatbotEnabled ? "Markdownの回答データを使って質問に回答します。" : "質問への回答を停止しています。"}</p></div><form action={updateChatbotStatus}><input type="hidden" name="chatbot_enabled" value={String(!chatbotEnabled)} /><ConfirmSubmitButton className={chatbotEnabled ? "danger" : "primary"} message={`チャットBotを${chatbotEnabled ? "停止" : "開始"}しますか？`}><Power />チャットBotを{chatbotEnabled ? "停止" : "開始"}</ConfirmSubmitButton></form></section>

    <div className="chatbot-workspace"><ChatbotPreview enabled={chatbotEnabled} /><aside className="chatbot-sources"><h2>現在の回答元</h2><div><Database /><span><strong>{knowledge.length}件</strong>Markdown回答データ</span></div><div><Sparkles /><span><strong>{upcomingEvents ?? 0}件</strong>今後のイベント</span></div><small>{sources.length}個のMarkdownファイルを読み込み済みです。FAQは回答元に含めません。</small></aside></div>

    <section className="chatbot-email-panel"><div className="chatbot-email-copy"><span className="chatbot-icon"><Mail /></span><div><h2>有人対応のメール通知</h2><p>利用者が「はい」を選んだ場合だけ、この宛先へ通知します。</p></div></div><form action={updateChatbotEscalationEmail}><label>通知先メールアドレス<input name="escalation_email" type="email" maxLength={254} defaultValue={settings?.chatbot_escalation_email ?? ""} placeholder="例：admin@example.com" /></label><button className="primary">通知先を保存</button></form><small>空欄で保存するとメール通知を停止します。対応待ちへの登録は継続します。</small></section>

    <section className="markdown-import-panel"><div className="markdown-import-copy"><span className="chatbot-icon"><FileText /></span><div><h2>Markdownを読み込む</h2><p>見出しごとに回答へ分割します。同じファイル名で再度読み込むと内容を差し替えます。</p></div></div><form action={importChatbotMarkdown}><label className="markdown-file-input"><Upload /><span><strong>.mdファイルを選択</strong><small>UTF-8・最大512KB</small></span><input name="markdown_file" type="file" accept=".md,text/markdown,text/plain" required /></label><button className="dark">読み込んで反映</button></form><details className="markdown-format-help"><summary>推奨する書き方</summary><pre>{`# 参加条件\n## 初心者でも参加できますか？\n初心者の方も歓迎しています。\nキーワード: 初心者、未経験、テニス初めて`}</pre></details></section>

    <div className="knowledge-heading"><div><p className="eyebrow green">MARKDOWN SOURCES</p><h2>読み込み済みファイル</h2></div><span>{sources.length}件</span></div>
    <div className="knowledge-list">{sources.map((source) => <article className="knowledge-card knowledge-source-card" key={source.name}><div><FileText /><span><strong>{source.name}</strong><small>{source.count}件の回答 ・ 最終反映 {formatDate(source.updatedAt)}</small></span></div><form action={deleteChatbotMarkdownSource}><input type="hidden" name="source_name" value={source.name} /><ConfirmSubmitButton className="danger" message={`「${source.name}」と取り込んだ回答を削除しますか？`}>削除</ConfirmSubmitButton></form></article>)}{!sources.length && <div className="empty knowledge-empty"><FileText /><p>Markdownはまだ読み込まれていません。</p><small>上のファイル選択から回答データを取り込めます。</small></div>}</div>
  </section>;
}

function errorMessage(error: string) {
  if (error === "email-validation") return "正しいメールアドレスを入力してください。";
  if (error === "email-save") return "通知先を保存できませんでした。追加マイグレーションをご確認ください。";
  if (error === "status-validation" || error === "status-save") return "チャットBotの稼働状態を変更できませんでした。";
  if (error === "markdown-file") return "512KB以下のMarkdown（.md）ファイルを選択してください。";
  if (error === "markdown-empty") return "回答データとして取り込める文章がありませんでした。";
  if (error === "markdown-delete") return "Markdownの回答データを削除できませんでした。";
  return "Markdownを反映できませんでした。追加マイグレーションをご確認ください。";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}
