import { db } from "@/lib/db";
import { formatEventAnswer, normalizeChatText, type ChatbotEvent } from "@/lib/chatbot";

export async function answerEvents(question: string) {
  const events: ChatbotEvent[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db().from("events").select("id,title,starts_at,ends_at,location,capacity,description,reservations(status)")
      .gte("ends_at", new Date().toISOString()).order("starts_at").order("id").range(start, start + 499);
    if (error) throw new Error("イベントを取得できませんでした。");
    events.push(...data as ChatbotEvent[]);
    if (data.length < 500) break;
  }
  const q = normalizeChatText(question);
  const now = new Date(Date.now() + 9 * 3600_000);
  const monthMatch = q.match(/(?:(\d{4})年)?(\d{1,2})月/);
  let month = monthMatch ? Number(monthMatch[2]) : q.includes("来月") ? now.getUTCMonth() + 2 : q.includes("今月") ? now.getUTCMonth() + 1 : undefined;
  let year = monthMatch?.[1] ? Number(monthMatch[1]) : now.getUTCFullYear();
  if (month === 13) { month = 1; year += 1; }
  const byDate = events.filter((event) => {
    if (!month) return true;
    const date = new Date(new Date(event.starts_at).getTime() + 9 * 3600_000);
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
  });
  const named = byDate.filter((event) => q.includes(normalizeChatText(event.title)));
  const requestedName = question.match(/[「『](.+?)[」』]/)?.[1];
  const matches = requestedName ? byDate.filter((e) => normalizeChatText(e.title).includes(normalizeChatText(requestedName))) : named.length ? named : byDate;
  if (!matches.length) return "該当する開催予定は現在登録されていません。運営スタッフへお問い合わせください。";
  const list = month || /一覧|全部|予定を/.test(q);
  return matches.slice(0, list ? 10 : 1).map((event) => formatEventAnswer(question, event)).join("\n\n")
    + (list && matches.length > 10 ? "\n\n続きはイベント画面で確認できます。" : "");
}
