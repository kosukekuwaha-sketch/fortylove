import { Bot, Database, FileText, Mail, ShieldCheck, Sparkles, Upload, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { deleteChatbotMarkdownSource, importChatbotMarkdown, updateChatbotAudienceAccess, updateChatbotAudienceSources, updateChatbotEscalationEmail } from "@/app/chatbot-actions";
import { ChatbotPreview } from "@/components/chatbot-preview";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMissingColumnError } from "@/lib/supabase-errors";

export const dynamic = "force-dynamic";

type KnowledgeRow = { id: string; source_name: string | null; updated_at: string };

export default async function ChatbotAdmin({ searchParams }: { searchParams: Promise<{ imported?: string; source_deleted?: string; email_updated?: string; access_updated?: string; sources_updated?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const { data: currentUser } = await client.from("users").select("role").eq("id", session.id).single();
  if (currentUser?.role !== "super_admin") redirect("/admin");

  const [{ data: knowledgeData, error: knowledgeError }, { count: upcomingEvents }, { data: baseSettings }, { data: sourceSettings, error: sourceSettingsError }] = await Promise.all([
    client.from("chatbot_knowledge").select("id,source_name,updated_at").eq("source_type", "markdown").order("updated_at", { ascending: false }),
    client.from("events").select("*", { count: "exact", head: true }).gte("ends_at", new Date().toISOString()),
    client.from("app_settings").select("chatbot_admin_enabled,chatbot_member_enabled,chatbot_escalation_email").eq("id", 1).maybeSingle(),
    client.from("app_settings").select("chatbot_admin_sources,chatbot_member_sources").eq("id", 1).maybeSingle(),
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
  const adminEnabled = baseSettings?.chatbot_admin_enabled ?? false;
  const memberEnabled = baseSettings?.chatbot_member_enabled ?? false;
  const sourceColumnsMissing = isMissingColumnError(sourceSettingsError, ["chatbot_admin_sources", "chatbot_member_sources"]);
  const { imported, source_deleted: sourceDeleted, email_updated: emailUpdated, access_updated: accessUpdated, sources_updated: sourcesUpdated, error } = await searchParams;
  const completed = sourcesUpdated
    ? `${sourcesUpdated === "admin" ? "管理者" : "一般ユーザー"}のMarkdown参照元を保存しました。`
    : accessUpdated
    ? `${accessUpdated.startsWith("admin") ? "管理者" : "一般ユーザー"}の利用を${accessUpdated.endsWith("on") ? "許可" : "停止"}しました。`
    : emailUpdated
      ? "有人対応の通知先メールアドレスを保存しました。"
      : sourceDeleted
        ? "Markdownと回答データを削除しました。"
        : imported !== undefined
          ? `${imported}件の回答データをMarkdownから反映しました。`
          : "";

  return <section className="admin-page chatbot-admin-page">
    <div className="page-title"><div><p className="eyebrow green">CHATBOT LAB</p><h1>チャットBot</h1><p>Markdownで回答内容を管理し、利用対象を設定します。</p></div><span className="stat"><strong>常時テスト可</strong></span></div>
    <div className="chatbot-draft-banner"><span className="chatbot-icon"><Bot /></span><div><strong>super_adminはいつでもテストできます</strong><p>管理者・一般ユーザーの公開設定は、下の利用設定から個別に切り替えられます。</p></div></div>
    {completed && <div className="success-message">{completed}</div>}
    {knowledgeError && <div className="alert">Bot回答データ用のテーブルがまだありません。追加マイグレーションをSupabaseへ適用してください。</div>}
    {error && <div className="alert">{errorMessage(error)}</div>}

    <section className="chatbot-access-panel"><div className="chatbot-access-heading"><ShieldCheck /><div><h2>利用設定</h2><p>super_adminのテスト利用には影響しません。</p></div></div><AccessRow audience="admin" label="管理者" description="管理画面からチャットBotを利用できます。" enabled={adminEnabled} icon={<ShieldCheck />} /><AccessRow audience="member" label="一般ユーザー" description="会員画面からチャットBotを利用できます。" enabled={memberEnabled} icon={<UsersRound />} /></section>

    <section className="chatbot-reference-panel"><div className="chatbot-access-heading"><Database /><div><h2>Markdown参照元</h2><p>管理者と一般ユーザーが参照するファイルを個別に選択します。</p></div></div>{sourceSettingsError && <div className="alert">{sourceColumnsMissing ? <>参照元の設定列がまだありません。Supabase SQL Editorで <code>20260904_add_chatbot_audience_sources.sql</code> を実行してください。</> : "参照元の設定を読み込めませんでした。時間をおいて再度お試しください。"}</div>}<div className="chatbot-reference-grid"><SourceSettingsForm audience="admin" label="管理者用" sources={sources} selected={sourceSettings?.chatbot_admin_sources ?? []} disabled={Boolean(sourceSettingsError)} /><SourceSettingsForm audience="member" label="一般ユーザー用" sources={sources} selected={sourceSettings?.chatbot_member_sources ?? []} disabled={Boolean(sourceSettingsError)} /></div></section>

    <div className="chatbot-workspace"><ChatbotPreview mode="preview" /><aside className="chatbot-sources"><h2>現在の回答元</h2><div><Database /><span><strong>{knowledge.length}件</strong>Markdown回答データ</span></div><div><Sparkles /><span><strong>{upcomingEvents ?? 0}件</strong>今後のイベント</span></div><small>{sources.length}個のMarkdownファイルを読み込み済みです。FAQは回答元に含めません。</small></aside></div>

    <section className="chatbot-email-panel"><div className="chatbot-email-copy"><span className="chatbot-icon"><Mail /></span><div><h2>有人対応のメール通知</h2><p>利用者が「はい」を選んだ場合だけ、この宛先へ通知します。</p></div></div><form action={updateChatbotEscalationEmail}><label>通知先メールアドレス<input name="escalation_email" type="email" maxLength={254} defaultValue={baseSettings?.chatbot_escalation_email ?? ""} placeholder="例：admin@example.com" /></label><button className="primary">通知先を保存</button></form><small>空欄で保存するとメール通知を停止します。対応待ちへの登録は継続します。</small></section>

    <section className="markdown-import-panel"><div className="markdown-import-copy"><span className="chatbot-icon"><FileText /></span><div><h2>Markdownを読み込む</h2><p>見出しごとに回答へ分割します。同じファイル名で再度読み込むと内容を差し替えます。</p></div></div><form action={importChatbotMarkdown}><label className="markdown-file-input"><Upload /><span><strong>.mdファイルを選択</strong><small>UTF-8・最大512KB</small></span><input name="markdown_file" type="file" accept=".md,text/markdown,text/plain" required /></label><button className="dark">読み込んで反映</button></form><details className="markdown-format-help"><summary>推奨する書き方</summary><pre>{`# 参加条件\n## 初心者でも参加できますか？\n初心者の方も歓迎しています。\nキーワード: 初心者、未経験、テニス初めて`}</pre></details></section>

    <div className="knowledge-heading"><div><p className="eyebrow green">MARKDOWN SOURCES</p><h2>読み込み済みファイル</h2></div><span>{sources.length}件</span></div>
    <div className="knowledge-list">{sources.map((source) => <article className="knowledge-card knowledge-source-card" key={source.name}><div><FileText /><span><strong>{source.name}</strong><small>{source.count}件の回答 ・ 最終反映 {formatDate(source.updatedAt)}</small></span></div><form action={deleteChatbotMarkdownSource}><input type="hidden" name="source_name" value={source.name} /><ConfirmSubmitButton className="danger" message={`「${source.name}」と取り込んだ回答を削除しますか？`}>削除</ConfirmSubmitButton></form></article>)}{!sources.length && <div className="empty knowledge-empty"><FileText /><p>Markdownはまだ読み込まれていません。</p><small>上のファイル選択から回答データを取り込めます。</small></div>}</div>
  </section>;
}

function errorMessage(error: string) {
  if (error === "email-validation") return "正しいメールアドレスを入力してください。";
  if (error === "email-save") return "通知先を保存できませんでした。追加マイグレーションをご確認ください。";
  if (error === "access-validation" || error === "access-save") return "チャットBotの利用設定を変更できませんでした。追加マイグレーションをご確認ください。";
  if (error === "sources-validation") return "選択したMarkdown参照元が見つかりませんでした。ページを再読み込みして選び直してください。";
  if (error === "sources-read") return "Markdown参照元を確認できませんでした。時間をおいて再度お試しください。";
  if (error === "sources-migration") return "参照元の設定列がまだありません。Supabase SQL Editorで 20260904_add_chatbot_audience_sources.sql を実行してください。";
  if (error === "sources-save") return "Markdown参照元を保存できませんでした。Vercel Logsで保存エラーをご確認ください。";
  if (error === "markdown-file") return "512KB以下のMarkdown（.md）ファイルを選択してください。";
  if (error === "markdown-empty") return "回答データとして取り込める文章がありませんでした。";
  if (error === "markdown-delete") return "Markdownの回答データを削除できませんでした。";
  return "Markdownを反映できませんでした。追加マイグレーションをご確認ください。";
}

function AccessRow({ audience, label, description, enabled, icon }: { audience: "admin" | "member"; label: string; description: string; enabled: boolean; icon: ReactNode }) {
  return <div className="chatbot-access-row"><span className="chatbot-access-icon">{icon}</span><div><strong>{label}</strong><p>{description}</p></div><span className={`knowledge-status ${enabled ? "active" : "inactive"}`}>{enabled ? "利用可" : "停止中"}</span><form action={updateChatbotAudienceAccess}><input type="hidden" name="audience" value={audience} /><input type="hidden" name="enabled" value={String(!enabled)} /><ConfirmSubmitButton className={enabled ? "danger" : "primary"} message={`${label}のチャットBot利用を${enabled ? "停止" : "許可"}しますか？`}>{enabled ? "利用を停止" : "利用を許可"}</ConfirmSubmitButton></form></div>;
}

function SourceSettingsForm({ audience, label, sources, selected, disabled }: { audience: "admin" | "member"; label: string; sources: { name: string; count: number }[]; selected: string[]; disabled: boolean }) {
  return <form action={updateChatbotAudienceSources} className="chatbot-reference-form"><input type="hidden" name="audience" value={audience} /><h3>{label}</h3><p>回答時に参照するMarkdownを選択</p><div>{sources.map((source) => <label key={source.name}><input type="checkbox" name="source_names" value={source.name} defaultChecked={selected.includes(source.name)} disabled={disabled} /><span><strong>{source.name}</strong><small>{source.count}件の回答</small></span></label>)}{!sources.length && <small>先にMarkdownを読み込んでください。</small>}</div><button className="primary" disabled={disabled || !sources.length}>参照元を保存</button></form>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}
