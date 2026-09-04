import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseChatbot, chatbotSourcesForAudience, type ChatbotRole } from "@/lib/chatbot-access";
import { decideKnowledgeResponse, formatEventAnswer, isEventQuestion, type ChatbotEvent, type ChatbotKnowledge } from "@/lib/chatbot";
import { generateGroundedAnswer } from "@/lib/gemini-chatbot";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  audience: z.enum(["admin", "member"]).optional(),
  choiceId: z.string().uuid().optional(),
});

function choiceResponse(records: ChatbotKnowledge[]) {
  return NextResponse.json({
    answer: "いくつか近い内容がありました。どれについて知りたいですか？",
    source: "Markdown回答候補",
    kind: "choices",
    choices: records.map((record, index) => ({ id: record.id, label: String(index + 1), title: record.title })),
  });
}

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

  if (!input.data.choiceId && isEventQuestion(input.data.message)) {
    const { data: events } = await client.from("events").select("id,title,starts_at,ends_at,location,capacity,description,reservations(status)").gte("ends_at", new Date().toISOString()).order("starts_at").limit(1);
    const event = events?.[0] as ChatbotEvent | undefined;
    if (event) return NextResponse.json({ answer: formatEventAnswer(input.data.message, event), source: `イベント情報：${event.title}`, kind: "event" });
  }

  const { data: records } = sourceNames.length
    ? await client.from("chatbot_knowledge").select("id,title,content,category,keywords,priority,is_active,source_name").eq("source_type", "markdown").in("source_name", sourceNames).order("priority", { ascending: false })
    : { data: [] };
  const knowledge = (records ?? []) as ChatbotKnowledge[];

  if (input.data.choiceId) {
    const selected = knowledge.find((record) => record.id === input.data.choiceId);
    if (!selected) return NextResponse.json({ error: "選択肢を確認できませんでした。もう一度質問してください。" }, { status: 400 });
    return NextResponse.json({ answer: selected.content, source: `Bot回答データ：${selected.title}`, kind: "knowledge" });
  }

  const decision = decideKnowledgeResponse(input.data.message, knowledge);
  if (decision.kind === "direct") {
    return NextResponse.json({ answer: decision.record.content, source: `Bot回答データ：${decision.record.title}`, kind: "knowledge" });
  }
  if (decision.kind === "choices") return choiceResponse(decision.records);
  if (decision.kind === "synthesize") {
    const synthesized = await generateGroundedAnswer(input.data.message, decision.records);
    if (synthesized) {
      return NextResponse.json({ answer: synthesized, source: "Gemini・関連Markdown", kind: "gemini" });
    }
    return choiceResponse(decision.records);
  }

  const generated = await generateGroundedAnswer(input.data.message, knowledge);
  if (generated) return NextResponse.json({ answer: generated, source: `Gemini・Markdown：${sourceNames.join("、")}`, kind: "gemini" });
  return NextResponse.json({
    answer: settings?.chatbot_fallback_message ?? "この質問はまだ回答データがありません。",
    source: "回答データなし",
    kind: "fallback",
    offerEscalation: true,
  });
}
