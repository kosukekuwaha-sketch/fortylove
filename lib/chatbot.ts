export type ChatbotKnowledge = {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  priority: number;
  is_active: boolean;
  source_name?: string | null;
};

export type ChatbotEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  capacity: number;
  description: string | null;
  reservations?: { status: string }[];
};

export function normalizeChatText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s\p{P}\p{S}]/gu, "");
}

function bigrams(value: string) {
  const normalized = normalizeChatText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function diceSimilarity(left: string, right: string) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

export type RankedKnowledge = {
  record: ChatbotKnowledge;
  score: number;
  keywordHits: number;
  similarity: number;
};

export type KnowledgeDecision =
  | { kind: "none" }
  | { kind: "direct"; record: ChatbotKnowledge }
  | { kind: "choices"; records: ChatbotKnowledge[] }
  | { kind: "synthesize"; records: ChatbotKnowledge[] };

export function rankKnowledgeAnswers(question: string, records: ChatbotKnowledge[]): RankedKnowledge[] {
  const normalizedQuestion = normalizeChatText(question);
  return records.map((record) => {
    const keywordHits = record.keywords.filter((keyword) => {
      const normalizedKeyword = normalizeChatText(keyword);
      return normalizedKeyword.length >= 2 && normalizedQuestion.includes(normalizedKeyword);
    }).length;
    const titleIncluded = normalizedQuestion.includes(normalizeChatText(record.title));
    const similarity = diceSimilarity(question, `${record.title} ${record.keywords.join(" ")}`);
    const score = keywordHits * 100 + (titleIncluded ? 60 : 0) + similarity * 40 + record.priority;
    return { record, score, keywordHits, similarity };
  })
    .filter((match) => match.keywordHits > 0 || match.similarity >= 0.22)
    .sort((left, right) => right.score - left.score);
}

export function decideKnowledgeResponse(question: string, records: ChatbotKnowledge[]): KnowledgeDecision {
  const ranked = rankKnowledgeAnswers(question, records);
  const best = ranked[0];
  if (!best) return { kind: "none" };

  const normalizedQuestion = normalizeChatText(question);
  if (normalizedQuestion === normalizeChatText(best.record.title)) {
    return { kind: "direct", record: best.record };
  }

  const multiIntent = question.length >= 12
    && ranked.filter((match) => match.keywordHits > 0).length >= 2
    && /(?:、|と|も|けど|ながら|それに|さらに|両方)/.test(question);
  if (multiIntent) return { kind: "synthesize", records: ranked.slice(0, 3).map((match) => match.record) };

  const closeMatches = ranked
    .filter((match) => best.score - match.score <= 25)
    .slice(0, 3);
  if (closeMatches.length >= 2) {
    return { kind: "choices", records: closeMatches.map((match) => match.record) };
  }
  return { kind: "direct", record: best.record };
}

export function findKnowledgeAnswer(question: string, records: ChatbotKnowledge[]) {
  const decision = decideKnowledgeResponse(question, records);
  return decision.kind === "direct" ? decision.record : null;
}

const eventSubjectWords = ["新歓", "イベント", "練習", "予定"];
const eventDetailWords = ["開催", "次回", "次の", "いつ", "何時", "日程", "どこ", "場所", "空き", "空席", "定員", "入れる"];

export function isEventQuestion(question: string) {
  const normalized = normalizeChatText(question);
  const asksRecruitingPeriod = ["いつまで", "募集期間", "受付期間", "新歓期間"]
    .some((word) => normalized.includes(normalizeChatText(word)));
  if (asksRecruitingPeriod) return false;
  const hasSubject = eventSubjectWords.some((word) => normalized.includes(normalizeChatText(word)));
  const hasDetail = eventDetailWords.some((word) => normalized.includes(normalizeChatText(word)));
  return hasDetail && (hasSubject || ["空き", "空席", "定員", "入れる"].some((word) => normalized.includes(normalizeChatText(word))));
}

export function formatEventAnswer(question: string, event: ChatbotEvent) {
  const reserved = event.reservations?.filter((reservation) => reservation.status === "reserved").length ?? 0;
  const seats = Math.max(0, event.capacity - reserved);
  const startsAt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(event.starts_at));
  const normalized = normalizeChatText(question);
  if (["空き", "空席", "定員", "入れる"].some((word) => normalized.includes(normalizeChatText(word)))) {
    return `${event.title}は、回答時点であと${seats}名分の空きがあります。参加枠は予約時に改めて確定します。`;
  }
  if (["どこ", "場所"].some((word) => normalized.includes(normalizeChatText(word)))) {
    return `${event.title}は${event.location}で開催します。開始は${startsAt}です。`;
  }
  return `次の予定は「${event.title}」です。${startsAt}から、${event.location}で開催します。${event.description ? `内容は「${event.description}」です。` : ""}`;
}
