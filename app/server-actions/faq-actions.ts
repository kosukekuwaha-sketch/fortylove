"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { embedTexts } from "@/lib/embeddings";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/server/action-context";
import { parseActionInput } from "@/lib/server/action-input";
import { writeAuditLog } from "@/lib/server/audit-log";
import { formText } from "@/lib/server/form-data";
import {
  answerFaqInputSchema,
  createFaqInputSchema,
  deleteFaqCategoryInputSchema,
  faqCategoryInputSchema,
  faqIdInputSchema,
  faqQuestionInputSchema,
  faqSubmissionIdInputSchema,
  updateFaqInputSchema,
} from "@/lib/server-action-validation";

async function faqEmbedding(question: string, answer: string) {
  try { return (await embedTexts([`${question}\n${answer}`]))[0]; } catch { return null; }
}

const faqFormInput = (formData: FormData) => ({
  question: formText(formData, "question"),
  answer: formText(formData, "answer"),
  category: formText(formData, "category") || "その他",
  sort_order: formText(formData, "sort_order") || "0",
  is_published: formText(formData, "is_published"),
});

export async function submitFaqQuestion(formData: FormData) {
  const user = await requireSession();
  const input = parseActionInput(
    faqQuestionInputSchema,
    { question: formText(formData, "question") },
    "/faq?error=question",
  );
  const { error } = await db().from("faq_questions").insert({ user_id: user.id, question: input.question });
  if (error) redirect("/faq?error=submit");
  redirect("/faq?submitted=1");
}

export async function answerSubmittedQuestion(formData: FormData) {
  const user = await requireAdmin();
  const input = parseActionInput(answerFaqInputSchema, {
    submission_id: formText(formData, "submission_id"),
    ...faqFormInput(formData),
  }, "/admin/faqs?error=answer");
  const { submission_id: submissionId, ...faqInput } = input;
  const client = db();
  const { data: faq, error: faqError } = await client.from("faqs").insert({ ...faqInput, embedding: await faqEmbedding(faqInput.question, faqInput.answer) }).select("id").single();
  if (faqError || !faq) redirect("/admin/faqs?error=answer");
  const { error: submissionError } = await client.from("faq_questions").update({
    status: "answered",
    published_faq_id: faq.id,
    resolved_at: new Date().toISOString(),
  }).eq("id", submissionId).eq("status", "pending");
  if (submissionError) {
    await client.from("faqs").delete().eq("id", faq.id);
    redirect("/admin/faqs?error=answer");
  }
  await writeAuditLog(client, { actorId: user.id, action: "faq.question.answer", targetType: "faq_question", targetId: submissionId });
  redirect("/admin/faqs?answered=1");
}

export async function dismissSubmittedQuestion(formData: FormData) {
  const user = await requireAdmin();
  const { submission_id: submissionId } = parseActionInput(
    faqSubmissionIdInputSchema,
    { submission_id: formText(formData, "submission_id") },
    "/admin/faqs?error=dismiss",
  );
  const client = db();
  const { error } = await client.from("faq_questions").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", submissionId).eq("status", "pending");
  if (error) redirect("/admin/faqs?error=dismiss");
  await writeAuditLog(client, { actorId: user.id, action: "faq.question.dismiss", targetType: "faq_question", targetId: submissionId });
  redirect("/admin/faqs?dismissed=1");
}

export async function createFaq(formData: FormData) {
  const user = await requireAdmin();
  const input = parseActionInput(createFaqInputSchema, faqFormInput(formData), "/admin/faqs?error=create");
  const client = db();
  const { data, error } = await client.from("faqs").insert({ ...input, embedding: await faqEmbedding(input.question, input.answer) }).select("id").single();
  if (error) redirect("/admin/faqs?error=create");
  await writeAuditLog(client, { actorId: user.id, action: "faq.create", targetType: "faq", targetId: data?.id });
  redirect("/admin/faqs?created=1");
}

export async function createFaqCategory(formData: FormData) {
  const user = await requireAdmin();
  const input = parseActionInput(
    faqCategoryInputSchema,
    { name: formText(formData, "name"), sort_order: formText(formData, "sort_order") || "0" },
    "/admin/faqs?error=category",
  );
  const client = db();
  const { data, error } = await client.from("faq_categories").insert(input).select("id").single();
  if (error) redirect("/admin/faqs?error=category");
  await writeAuditLog(client, { actorId: user.id, action: "faq.category.create", targetType: "faq_category", targetId: data?.id });
  redirect("/admin/faqs?category_created=1");
}

export async function deleteFaqCategory(formData: FormData) {
  const user = await requireAdmin();
  const input = parseActionInput(deleteFaqCategoryInputSchema, {
    category_id: formText(formData, "category_id"),
    category_name: formText(formData, "category_name"),
  }, "/admin/faqs?error=category");
  const { category_id: categoryId, category_name: categoryName } = input;
  const client = db();
  const { count } = await client.from("faqs").select("*", { count: "exact", head: true }).eq("category", categoryName);
  if (count) redirect("/admin/faqs?error=category-used");
  const { error } = await client.from("faq_categories").delete().eq("id", categoryId);
  if (error) redirect("/admin/faqs?error=category");
  await writeAuditLog(client, { actorId: user.id, action: "faq.category.delete", targetType: "faq_category", targetId: categoryId });
  redirect("/admin/faqs?category_deleted=1");
}

export async function updateFaq(formData: FormData) {
  const user = await requireAdmin();
  const input = parseActionInput(updateFaqInputSchema, {
    faq_id: formText(formData, "faq_id"),
    ...faqFormInput(formData),
  }, "/admin/faqs?error=update");
  const { faq_id: faqId, ...faqInput } = input;
  const client = db();
  const { error } = await client.from("faqs").update({
    ...faqInput,
    embedding: await faqEmbedding(faqInput.question, faqInput.answer),
    updated_at: new Date().toISOString(),
  }).eq("id", faqId);
  if (error) redirect("/admin/faqs?error=update");
  await writeAuditLog(client, { actorId: user.id, action: "faq.update", targetType: "faq", targetId: faqId });
  redirect("/admin/faqs?updated=1");
}

export async function deleteFaq(formData: FormData) {
  const user = await requireAdmin();
  const { faq_id: faqId } = parseActionInput(
    faqIdInputSchema,
    { faq_id: formText(formData, "faq_id") },
    "/admin/faqs?error=delete",
  );
  const client = db();
  const { error } = await client.from("faqs").delete().eq("id", faqId);
  if (error) redirect("/admin/faqs?error=delete");
  await writeAuditLog(client, { actorId: user.id, action: "faq.delete", targetType: "faq", targetId: faqId });
  redirect("/admin/faqs?deleted=1");
}

export async function reorderFaqs(ids: string[]) {
  const user = await requireAdmin();
  const parsed = z.array(z.string().uuid()).max(10000).refine((values) => new Set(values).size === values.length).safeParse(ids);
  if (!parsed.success) return { error: "並び順を確認してください。" };
  const { error } = await db().rpc("reorder_faqs", { p_actor: user.id, p_ids: parsed.data });
  if (error) return { error: "一覧が変更されたか保存に失敗しました。再読み込みしてお試しください。" };
  revalidatePath("/faq");
  return { error: null };
}

export async function refreshFaqSearch() {
  await requireAdmin();
  const client = db();
  const { data, error } = await client.from("faqs").select("id,question,answer,updated_at").eq("is_published", true).is("embedding", null).order("id").limit(25);
  if (error) return { error: "検索データを読み込めません。追加マイグレーションをご確認ください。", updated: 0, more: false };
  if (!data.length) return { error: null, updated: 0, more: false };
  try {
    const vectors = await embedTexts(data.map((faq) => `${faq.question}\n${faq.answer}`));
    for (let i = 0; i < data.length; i++) {
      const result = await client.from("faqs").update({ embedding: vectors[i] }).eq("id", data[i].id).eq("updated_at", data[i].updated_at);
      if (result.error) throw new Error("保存に失敗しました。");
    }
    return { error: null, updated: data.length, more: data.length === 25 };
  } catch { return { error: "検索データの生成に失敗しました。API設定・利用枠を確認して再試行してください。FAQ本文は維持されています。", updated: 0, more: false }; }
}
