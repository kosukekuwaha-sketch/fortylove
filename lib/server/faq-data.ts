import { db } from "@/lib/db";

export type FaqRow = { id: string; question: string; answer: string; category: string; sort_order: number; is_published: boolean; updated_at: string };
export async function readFaqs(publishedOnly = false) {
  const rows: FaqRow[] = [];
  const client = db();
  for (let start = 0; ; start += 500) {
    let query = client.from("faqs").select("id,question,answer,category,sort_order,is_published,updated_at").order("sort_order").order("id").range(start, start + 499);
    if (publishedOnly) query = query.eq("is_published", true);
    const { data, error } = await query;
    if (error) return { data: [] as FaqRow[], error };
    rows.push(...data as FaqRow[]);
    if (data.length < 500) return { data: rows, error: null };
  }
}
