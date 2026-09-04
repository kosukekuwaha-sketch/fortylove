import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseChatbot, chatbotSourcesForAudience, type ChatbotRole } from "@/lib/chatbot-access";
import { findKnowledgeAnswer, formatEventAnswer, isEventQuestion, type ChatbotEvent, type ChatbotKnowledge } from "@/lib/chatbot";
import { generateGroundedAnswer } from "@/lib/gemini-chatbot";

const requestSchema = z.object({ message: z.string().trim().min(1).max(500), audience: z.enum(["admin", "member"]).optional() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const client = db();
  const { data: user } = await client.from("users").select("role").eq("id", session.id).single();
  if (!user) return NextResponse.json({ error: "利用できません。" }, { status: 403 });

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "質問は500文字以内で入力してください。" }, { status: 400 });

  const role = user.role as ChatbotRole;
  const { data: settings } = await client.from("app_settings").select("chatbot_admin_enabled,chatbot_member_enabled,chatbot_admin_sources,chatbot_member_sources,chatbot_fallback_message").eq("id", 1).maybeSingle();
  if (!canUseChatbot(role, settings)) return NextResponse.json({ error: "チャットBotの利用は許可されていません。" }, { status: 403 });
  const audience = role === "super_admin" ? input.data.audience ?? "member" : role === "admin" ? "admin" : "member";
  const sourceNames = chatbotSourcesForAudience(audience, settings);
  if (role !== "super_admin") {
    const usageDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const { data: consumed, error: usageError } = await client.rpc("consume_chatbot_message", { p_user_id: session.id, p_usage_date: usageDate });
    if (usageError) return NextResponse.json({ error: "利用回数を確認できませんでした。時間をおいてお試しください。" }, { status: 503 });
    if (!consumed) return NextResponse.json({ answer: "本日のチャット利用上限（10件）に達しました。", source: "1日10件まで", kind: "daily-limit", offerEscalation: true }, { status: 429 });
  }

  if (isEventQuestion(input.data.message)) {
    const { data: events } = await client.from("events").select("id,title,starts_at,ends_at,location,capacity,description,reservations(status)").gte("ends_at", new Date().toISOString()).order("starts_at").limit(1);
    const event = events?.[0] as ChatbotEvent | undefined;
    if (event) return NextResponse.json({ answer: formatEventAnswer(input.data.message, event), source: `イベント情報：${event.title}`, kind: "event" });
  }

  const { data: records } = sourceNames.length
    ? await client.from("chatbot_knowledge").select("id,title,content,category,keywords,priority,is_active,source_name").eq("source_type", "markdown").in("source_name", sourceNames).order("priority", { ascending: false })
    : { data: [] };
  const knowledge = (records ?? []) as ChatbotKnowledge[];
  const match = findKnowledgeAnswer(input.data.message, knowledge);
  if (match) return NextResponse.json({ answer: match.content, source: `Bot回答データ：${match.title}`, kind: "knowledge" });
  const generated = await generateGroundedAnswer(input.data.message, knowledge);
  if (generated) return NextResponse.json({ answer: generated, source: `Gemini・Markdown：${sourceNames.join("、")}`, kind: "gemini" });
  return NextResponse.json({
    answer: settings?.chatbot_fallback_message ?? "この質問はまだ回答データがありません。",
    source: "回答データなし",
    kind: "fallback",
    offerEscalation: true,
  });
}
