"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/server/action-context";
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

export async function submitFaqQuestion(formData: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const parsed = faqQuestionInputSchema.safeParse({ question: formText(formData, "question") });
  if (!parsed.success) redirect("/faq?error=question");
  const { error } = await db().from("faq_questions").insert({ user_id: user.id, question: parsed.data.question });
  if (error) redirect("/faq?error=submit");
  redirect("/faq?submitted=1");
}

export async function answerSubmittedQuestion(formData: FormData) {
  const user = await requireAdmin();
  const parsed = answerFaqInputSchema.safeParse({
    submission_id: formText(formData, "submission_id"),
    question: formText(formData, "question"),
    answer: formText(formData, "answer"),
    category: formText(formData, "category") || "その他",
    sort_order: formText(formData, "sort_order") || "0",
    is_published: formText(formData, "is_published"),
  });
  if (!parsed.success) redirect("/admin/faqs?error=answer");
  const { submission_id: submissionId, ...faqInput } = parsed.data;
  const client = db();
  const { data: faq, error: faqError } = await client.from("faqs").insert(faqInput).select("id").single();
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
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.question.answer", target_type: "faq_question", target_id: submissionId });
  redirect("/admin/faqs?answered=1");
}

export async function dismissSubmittedQuestion(formData: FormData) {
  const user = await requireAdmin();
  const parsed = faqSubmissionIdInputSchema.safeParse({ submission_id: formText(formData, "submission_id") });
  if (!parsed.success) redirect("/admin/faqs?error=dismiss");
  const submissionId = parsed.data.submission_id;
  const client = db();
  const { error } = await client.from("faq_questions").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", submissionId).eq("status", "pending");
  if (error) redirect("/admin/faqs?error=dismiss");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.question.dismiss", target_type: "faq_question", target_id: submissionId });
  redirect("/admin/faqs?dismissed=1");
}

export async function createFaq(formData: FormData) {
  const user = await requireAdmin();
  const parsed = createFaqInputSchema.safeParse({
    question: formText(formData, "question"),
    answer: formText(formData, "answer"),
    category: formText(formData, "category") || "その他",
    sort_order: formText(formData, "sort_order") || "0",
    is_published: formText(formData, "is_published"),
  });
  if (!parsed.success) redirect("/admin/faqs?error=create");
  const client = db();
  const { data, error } = await client.from("faqs").insert(parsed.data).select("id").single();
  if (error) redirect("/admin/faqs?error=create");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.create", target_type: "faq", target_id: data?.id });
  redirect("/admin/faqs?created=1");
}

export async function createFaqCategory(formData: FormData) {
  const user = await requireAdmin();
  const parsed = faqCategoryInputSchema.safeParse({ name: formText(formData, "name"), sort_order: formText(formData, "sort_order") || "0" });
  if (!parsed.success) redirect("/admin/faqs?error=category");
  const client = db();
  const { data, error } = await client.from("faq_categories").insert(parsed.data).select("id").single();
  if (error) redirect("/admin/faqs?error=category");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.category.create", target_type: "faq_category", target_id: data?.id });
  redirect("/admin/faqs?category_created=1");
}

export async function deleteFaqCategory(formData: FormData) {
  const user = await requireAdmin();
  const parsed = deleteFaqCategoryInputSchema.safeParse({
    category_id: formText(formData, "category_id"),
    category_name: formText(formData, "category_name"),
  });
  if (!parsed.success) redirect("/admin/faqs?error=category");
  const { category_id: categoryId, category_name: categoryName } = parsed.data;
  const client = db();
  const { count } = await client.from("faqs").select("*", { count: "exact", head: true }).eq("category", categoryName);
  if (count) redirect("/admin/faqs?error=category-used");
  const { error } = await client.from("faq_categories").delete().eq("id", categoryId);
  if (error) redirect("/admin/faqs?error=category");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.category.delete", target_type: "faq_category", target_id: categoryId });
  redirect("/admin/faqs?category_deleted=1");
}

export async function updateFaq(formData: FormData) {
  const user = await requireAdmin();
  const parsed = updateFaqInputSchema.safeParse({
    faq_id: formText(formData, "faq_id"),
    question: formText(formData, "question"),
    answer: formText(formData, "answer"),
    category: formText(formData, "category") || "その他",
    sort_order: formText(formData, "sort_order") || "0",
    is_published: formText(formData, "is_published"),
  });
  if (!parsed.success) redirect("/admin/faqs?error=update");
  const { faq_id: faqId, ...faqInput } = parsed.data;
  const client = db();
  const { error } = await client.from("faqs").update({
    ...faqInput,
    updated_at: new Date().toISOString(),
  }).eq("id", faqId);
  if (error) redirect("/admin/faqs?error=update");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.update", target_type: "faq", target_id: faqId });
  redirect("/admin/faqs?updated=1");
}

export async function deleteFaq(formData: FormData) {
  const user = await requireAdmin();
  const parsed = faqIdInputSchema.safeParse({ faq_id: formText(formData, "faq_id") });
  if (!parsed.success) redirect("/admin/faqs?error=delete");
  const faqId = parsed.data.faq_id;
  const client = db();
  const { error } = await client.from("faqs").delete().eq("id", faqId);
  if (error) redirect("/admin/faqs?error=delete");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.delete", target_type: "faq", target_id: faqId });
  redirect("/admin/faqs?deleted=1");
}
