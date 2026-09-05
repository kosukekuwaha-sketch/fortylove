import { db } from "@/lib/db";
import type { ChatbotKnowledge } from "@/lib/chatbot";

// Explicit pagination avoids PostgREST's default row limit for multi-file imports.
export async function readKnowledge(sourceNames: string[]): Promise<ChatbotKnowledge[]> {
  const client = db();
  const records: ChatbotKnowledge[] = [];
  if (sourceNames.length) {
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from("chatbot_knowledge")
        .select("id,title,content,category,keywords,priority,is_active,source_name")
        .eq("source_type", "markdown").in("source_name", sourceNames).order("id").range(start, start + 499);
      if (error) throw new Error("回答資料を取得できませんでした。");
      records.push(...data as ChatbotKnowledge[]);
      if (data.length < 500) break;
    }
  }
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from("faqs").select("id,question,answer,category").eq("is_published", true).order("id").range(start, start + 499);
    if (error) throw new Error("FAQを取得できませんでした。");
    records.push(...data.map((faq) => ({ id: faq.id, title: faq.question, content: faq.answer,
      category: faq.category, keywords: [], priority: 0, is_active: true, source_name: "公開FAQ" })));
    if (data.length < 500) break;
  }
  return records;
}
