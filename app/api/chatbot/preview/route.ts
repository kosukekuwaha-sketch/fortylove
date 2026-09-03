import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { findKnowledgeAnswer, formatEventAnswer, isEventQuestion, type ChatbotEvent, type ChatbotKnowledge } from "@/lib/chatbot";

const requestSchema = z.object({ message: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const client = db();
  const { data: user } = await client.from("users").select("role").eq("id", session.id).single();
  if (user?.role !== "super_admin") return NextResponse.json({ error: "利用できません。" }, { status: 403 });

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "質問は500文字以内で入力してください。" }, { status: 400 });

  if (isEventQuestion(input.data.message)) {
    const { data: events } = await client.from("events").select("id,title,starts_at,ends_at,location,capacity,description,reservations(status)").gte("ends_at", new Date().toISOString()).order("starts_at").limit(1);
    const event = events?.[0] as ChatbotEvent | undefined;
    if (event) return NextResponse.json({ answer: formatEventAnswer(input.data.message, event), source: `イベント情報：${event.title}`, kind: "event" });
  }

  const [{ data: records }, { data: settings }] = await Promise.all([
    client.from("chatbot_knowledge").select("id,title,content,category,keywords,priority,is_active").eq("is_active", true).order("priority", { ascending: false }),
    client.from("app_settings").select("chatbot_fallback_message").eq("id", 1).maybeSingle(),
  ]);
  const match = findKnowledgeAnswer(input.data.message, (records ?? []) as ChatbotKnowledge[]);
  if (match) return NextResponse.json({ answer: match.content, source: `Bot回答データ：${match.title}`, kind: "knowledge" });
  return NextResponse.json({ answer: settings?.chatbot_fallback_message ?? "この質問はまだ回答データがありません。担当者が確認できるよう、回答内容を追加してください。", source: "回答データなし", kind: "fallback" });
}
