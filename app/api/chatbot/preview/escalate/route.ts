import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

const requestSchema = z.object({ question: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const client = db();
  const { data: user } = await client.from("users").select("role").eq("id", session.id).single();
  if (user?.role !== "super_admin") return NextResponse.json({ error: "利用できません。" }, { status: 403 });

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "質問内容を確認してください。" }, { status: 400 });

  const storedQuestion = `【チャットBot】${input.data.question}`.slice(0, 500);
  const duplicateSince = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: existing } = await client.from("faq_questions").select("id").eq("user_id", session.id).eq("question", storedQuestion).eq("status", "pending").gte("created_at", duplicateSince).limit(1).maybeSingle();
  if (existing) return NextResponse.json({ message: "すでに管理者の対応待ちへ登録されています。", id: existing.id });

  const { data, error } = await client.from("faq_questions").insert({ user_id: session.id, question: storedQuestion, status: "pending" }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "管理者へ通知できませんでした。" }, { status: 500 });
  await client.from("audit_logs").insert({ actor_id: session.id, action: "chatbot.escalation.request", target_type: "faq_question", target_id: data.id });
  return NextResponse.json({ message: "管理者の対応待ちへ登録しました。", id: data.id });
}
