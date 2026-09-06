export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

// Persisted document vectors and queries always use the same model and dimensions.
export async function embedTexts(texts: string[], query = false, onProgress?: (completed: number) => void): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("検索用APIが未設定です。設定後に再試行してください。");
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 50) {
    const batch = texts.slice(offset, offset + 50);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ requests: batch.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] },
        taskType: query ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT", outputDimensionality: EMBEDDING_DIMENSIONS,
      })) }),
    });
    if (!response.ok) throw new Error("検索用データの生成に失敗しました。利用枠・接続を確認して再試行してください。");
    const data = await response.json() as { embeddings?: { values: number[] }[] };
    if (data.embeddings?.length !== batch.length || data.embeddings.some(({ values }) => values.length !== EMBEDDING_DIMENSIONS || values.some((n) => !Number.isFinite(n)))) {
      throw new Error("検索用データを検証できませんでした。再試行してください。");
    }
    vectors.push(...data.embeddings.map(({ values }) => values));
    onProgress?.(vectors.length);
  }
  return vectors;
}
