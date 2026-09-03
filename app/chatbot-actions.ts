"use server";

import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { formText, requireSuperAdmin } from "@/lib/server/action-context";
import { parseMarkdownKnowledge } from "@/lib/markdown-knowledge";

const knowledgeSchema = z.object({
  title: z.string().min(2).max(100),
  content: z.string().min(2).max(2000),
  category: z.string().min(1).max(50),
  priority: z.coerce.number().int().min(0).max(100),
  is_active: z.boolean(),
});

function parsedKnowledge(formData: FormData) {
  const parsed = knowledgeSchema.safeParse({
    title: formText(formData, "title"),
    content: formText(formData, "content"),
    category: formText(formData, "category") || "基本情報",
    priority: formText(formData, "priority") || "0",
    is_active: formText(formData, "is_active") === "true",
  });
  const keywords = formText(formData, "keywords").split(/[、,\n]/).map((keyword) => keyword.trim()).filter(Boolean);
  if (!parsed.success || !keywords.length || keywords.length > 20 || keywords.some((keyword) => keyword.length > 50)) return null;
  return { ...parsed.data, keywords: [...new Set(keywords)] };
}

export async function createChatbotKnowledge(formData: FormData) {
  const user = await requireSuperAdmin();
  const values = parsedKnowledge(formData);
  if (!values) redirect("/admin/chatbot?error=validation");
  const client = db();
  const { data, error } = await client.from("chatbot_knowledge").insert({ ...values, created_by: user.id, updated_by: user.id }).select("id").single();
  if (error || !data) redirect("/admin/chatbot?error=save");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.knowledge.create", target_type: "chatbot_knowledge", target_id: data.id });
  redirect("/admin/chatbot?created=1");
}

export async function updateChatbotKnowledge(formData: FormData) {
  const user = await requireSuperAdmin();
  const id = z.string().uuid().safeParse(formText(formData, "knowledge_id"));
  const values = parsedKnowledge(formData);
  if (!id.success || !values) redirect("/admin/chatbot?error=validation");
  const client = db();
  const { error } = await client.from("chatbot_knowledge").update({ ...values, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", id.data);
  if (error) redirect("/admin/chatbot?error=save");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.knowledge.update", target_type: "chatbot_knowledge", target_id: id.data });
  redirect("/admin/chatbot?updated=1");
}

export async function deleteChatbotKnowledge(formData: FormData) {
  const user = await requireSuperAdmin();
  const id = z.string().uuid().safeParse(formText(formData, "knowledge_id"));
  if (!id.success) redirect("/admin/chatbot?error=validation");
  const client = db();
  const { error } = await client.from("chatbot_knowledge").delete().eq("id", id.data);
  if (error) redirect("/admin/chatbot?error=delete");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.knowledge.delete", target_type: "chatbot_knowledge", target_id: id.data });
  redirect("/admin/chatbot?deleted=1");
}

export async function importChatbotMarkdown(formData: FormData) {
  const user = await requireSuperAdmin();
  const file = formData.get("markdown_file");
  if (!(file instanceof File) || !file.name.toLocaleLowerCase().endsWith(".md") || file.size < 1 || file.size > 512 * 1024) {
    redirect("/admin/chatbot?error=markdown-file");
  }
  const markdown = await file.text();
  const fallbackTitle = file.name.replace(/\.md$/i, "").trim().slice(0, 100) || "Markdown資料";
  const drafts = parseMarkdownKnowledge(markdown, fallbackTitle);
  if (!drafts.length) redirect("/admin/chatbot?error=markdown-empty");
  const sourceHash = createHash("sha256").update(markdown, "utf8").digest("hex");
  const sourceName = file.name.slice(0, 255);
  const client = db();
  const rows = drafts.map((draft) => ({
    title: draft.title,
    content: draft.content,
    category: draft.category,
    keywords: draft.keywords,
    priority: 0,
    is_active: false,
    source_type: "markdown",
    source_name: sourceName,
    source_section: draft.sourceSection,
    source_hash: sourceHash,
    created_by: user.id,
    updated_by: user.id,
  }));
  const { data, error } = await client.from("chatbot_knowledge").upsert(rows, { onConflict: "source_hash,source_section", ignoreDuplicates: true }).select("id");
  if (error) redirect("/admin/chatbot?error=markdown-import");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.knowledge.import_markdown", target_type: "chatbot_knowledge" });
  redirect(`/admin/chatbot?imported=${data?.length ?? 0}`);
}
