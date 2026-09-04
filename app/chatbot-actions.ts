"use server";

import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { formText, requireSuperAdmin } from "@/lib/server/action-context";
import { parseMarkdownKnowledge } from "@/lib/markdown-knowledge";
import { isMissingColumnError } from "@/lib/supabase-errors";

const escalationEmailSchema = z.union([z.literal(""), z.string().email().max(254)]);

export async function updateChatbotAudienceAccess(formData: FormData) {
  const user = await requireSuperAdmin();
  const audience = formText(formData, "audience");
  const value = formText(formData, "enabled");
  if (!['admin', 'member'].includes(audience) || (value !== "true" && value !== "false")) redirect("/admin/chatbot?error=access-validation");
  const enabled = value === "true";
  const client = db();
  const updates = audience === "admin" ? { chatbot_admin_enabled: enabled } : { chatbot_member_enabled: enabled };
  const { error } = await client.from("app_settings").update(updates).eq("id", 1);
  if (error) redirect("/admin/chatbot?error=access-save");
  await client.from("audit_logs").insert({ actor_id: user.id, action: `chatbot.access.${audience}.${enabled ? "enable" : "disable"}`, target_type: "app_settings" });
  redirect(`/admin/chatbot?access_updated=${audience}-${enabled ? "on" : "off"}`);
}

export async function updateChatbotAudienceSources(formData: FormData) {
  const user = await requireSuperAdmin();
  const audience = formText(formData, "audience");
  const sourceNames = [...new Set(formData.getAll("source_names").map((value) => String(value).trim()).filter(Boolean))];
  if (!['admin', 'member'].includes(audience) || sourceNames.length > 50 || sourceNames.some((name) => name.length > 255)) redirect("/admin/chatbot?error=sources-validation");
  const client = db();
  if (sourceNames.length) {
    const { data: available, error: sourceError } = await client.from("chatbot_knowledge").select("source_name").eq("source_type", "markdown").in("source_name", sourceNames);
    const availableNames = new Set((available ?? []).map((item) => item.source_name));
    if (sourceError) {
      console.error("Failed to verify chatbot Markdown sources", { code: sourceError.code, message: sourceError.message, details: sourceError.details });
      redirect("/admin/chatbot?error=sources-read");
    }
    if (sourceNames.some((name) => !availableNames.has(name))) redirect("/admin/chatbot?error=sources-validation");
  }
  const updates = audience === "admin" ? { chatbot_admin_sources: sourceNames } : { chatbot_member_sources: sourceNames };
  const { error } = await client.from("app_settings").update(updates).eq("id", 1);
  if (error) {
    console.error("Failed to save chatbot Markdown sources", { code: error.code, message: error.message, details: error.details });
    const missingColumns = ["chatbot_admin_sources", "chatbot_member_sources"];
    redirect(`/admin/chatbot?error=${isMissingColumnError(error, missingColumns) ? "sources-migration" : "sources-save"}`);
  }
  await client.from("audit_logs").insert({ actor_id: user.id, action: `chatbot.sources.${audience}.update`, target_type: "app_settings" });
  redirect(`/admin/chatbot?sources_updated=${audience}`);
}

export async function updateChatbotEscalationEmail(formData: FormData) {
  const user = await requireSuperAdmin();
  const parsed = escalationEmailSchema.safeParse(formText(formData, "escalation_email"));
  if (!parsed.success) redirect("/admin/chatbot?error=email-validation");
  const client = db();
  const { error } = await client.from("app_settings").update({ chatbot_escalation_email: parsed.data || null }).eq("id", 1);
  if (error) redirect("/admin/chatbot?error=email-save");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.escalation_email.update", target_type: "app_settings" });
  redirect("/admin/chatbot?email_updated=1");
}

export async function deleteChatbotMarkdownSource(formData: FormData) {
  const user = await requireSuperAdmin();
  const sourceName = z.string().min(1).max(255).safeParse(formText(formData, "source_name"));
  if (!sourceName.success) redirect("/admin/chatbot?error=markdown-source");
  const client = db();
  const { error } = await client.from("chatbot_knowledge").delete().eq("source_type", "markdown").eq("source_name", sourceName.data);
  if (error) redirect("/admin/chatbot?error=markdown-delete");
  const { data: settings } = await client.from("app_settings").select("chatbot_admin_sources,chatbot_member_sources").eq("id", 1).maybeSingle();
  await client.from("app_settings").update({
    chatbot_admin_sources: (settings?.chatbot_admin_sources ?? []).filter((name: string) => name !== sourceName.data),
    chatbot_member_sources: (settings?.chatbot_member_sources ?? []).filter((name: string) => name !== sourceName.data),
  }).eq("id", 1);
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.knowledge.delete_markdown", target_type: "chatbot_knowledge" });
  redirect("/admin/chatbot?source_deleted=1");
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
    is_active: true,
    source_type: "markdown",
    source_name: sourceName,
    source_section: draft.sourceSection,
    source_hash: sourceHash,
    created_by: user.id,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await client.from("chatbot_knowledge").upsert(rows, { onConflict: "source_hash,source_section" }).select("id");
  if (error) redirect("/admin/chatbot?error=markdown-import");
  const { error: cleanupError } = await client.from("chatbot_knowledge").delete().eq("source_type", "markdown").eq("source_name", sourceName).neq("source_hash", sourceHash);
  if (cleanupError) redirect("/admin/chatbot?error=markdown-import");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "chatbot.knowledge.import_markdown", target_type: "chatbot_knowledge" });
  redirect(`/admin/chatbot?imported=${data?.length ?? 0}`);
}
