export type MarkdownKnowledgeDraft = {
  title: string;
  category: string;
  content: string;
  keywords: string[];
  sourceSection: string;
};

type WorkingSection = { title: string; category: string; lines: string[]; order: number };

function plainText(markdown: string) {
  return markdown
    .replace(/<!--[^]*?-->/g, "")
    .replace(/```[^]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "・")
    .replace(/^\s*\d+[.)]\s+/gm, "・")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\|\s*:?-{3,}:?\s*(?=\|)/g, "|")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function derivedKeywords(title: string, explicit: string[]) {
  const titleParts = title.split(/[\s、,・/／:：()（）「」『』-]+/).map((value) => value.trim()).filter((value) => value.length >= 2);
  return [...new Set([...explicit, title, ...titleParts])].slice(0, 20);
}

function splitSection(section: WorkingSection): MarkdownKnowledgeDraft[] {
  const keywordLines: string[] = [];
  const bodyLines = section.lines.filter((line) => {
    const match = line.match(/^\s*(?:キーワード|keywords?)\s*[:：]\s*(.+)$/i);
    if (!match) return true;
    keywordLines.push(...match[1].split(/[、,]/).map((value) => value.trim()).filter(Boolean));
    return false;
  });
  const content = plainText(bodyLines.join("\n"));
  if (section.title.trim().length < 2 || content.length < 2) return [];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 2000) {
    let breakAt = Math.max(remaining.lastIndexOf("\n", 2000), remaining.lastIndexOf("。", 2000) + 1);
    if (breakAt < 500) breakAt = 2000;
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.map((chunk, index) => ({
    title: (chunks.length > 1 ? `${section.title}（${index + 1}/${chunks.length}）` : section.title).slice(0, 100),
    category: section.category.slice(0, 50) || "基本情報",
    content: chunk,
    keywords: derivedKeywords(section.title, keywordLines),
    sourceSection: `${section.order + 1}:${section.title}${chunks.length > 1 ? `:${index + 1}` : ""}`,
  }));
}

export function parseMarkdownKnowledge(markdown: string, fallbackTitle: string) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const sections: WorkingSection[] = [];
  let category = "基本情報";
  let current: WorkingSection | null = null;
  let insideFence = false;

  for (const line of normalized.split("\n")) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      current?.lines.push(line);
      continue;
    }
    const heading = !insideFence ? line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (!heading) {
      if (!current && line.trim()) current = { title: fallbackTitle, category, lines: [], order: sections.length };
      current?.lines.push(line);
      continue;
    }
    if (current) sections.push(current);
    const level = heading[1].length;
    const title = plainText(heading[2]);
    if (level === 1) category = title || "基本情報";
    current = { title, category: level === 1 ? "基本情報" : category, lines: [], order: sections.length };
  }
  if (current) sections.push(current);
  return sections.flatMap(splitSection).slice(0, 100);
}
