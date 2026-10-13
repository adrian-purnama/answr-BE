import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION = "article_chunks";

function createClient(): QdrantClient {
  const url = (process.env.QDRANT_URL ?? "http://192.168.1.4:6333")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/$/, "");
  const apiKey = (process.env.QDRANT_API_KEY ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");

  return new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {}),
  });
}

const client = createClient();

/** Payload fields used in Qdrant filters; newer Qdrant requires keyword indexes. */
const FILTER_PAYLOAD_FIELDS = [
  "topicId",
  "articleId",
  "apiKeyId",
  "userId",
  "chunkId",
] as const;

function isBenignQdrantError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const data =
    error && typeof error === "object" && "data" in error
      ? JSON.stringify((error as { data?: unknown }).data).toLowerCase()
      : "";
  return (
    message.includes("404") ||
    lower.includes("not found") ||
    lower.includes("already") ||
    lower.includes("conflict") ||
    data.includes("already") ||
    data.includes("conflict")
  );
}

let payloadIndexesReady: Promise<void> | null = null;

async function ensurePayloadIndexes(): Promise<void> {
  if (!payloadIndexesReady) {
    payloadIndexesReady = (async () => {
      for (const field_name of FILTER_PAYLOAD_FIELDS) {
        try {
          await client.createPayloadIndex(COLLECTION, {
            wait: true,
            field_name,
            field_schema: "keyword",
          });
        } catch (error) {
          if (isBenignQdrantError(error)) continue;
          throw error;
        }
      }
    })().catch((error) => {
      payloadIndexesReady = null;
      throw error;
    });
  }
  await payloadIndexesReady;
}

export async function ensureChunkCollection(vectorSize: number): Promise<void> {
  try {
    await client.getCollection(COLLECTION);
  } catch {
    await client.createCollection(COLLECTION, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
  }
  await ensurePayloadIndexes();
}

export interface QdrantChunkPoint {
  id: string;
  vector: number[];
  payload: {
    chunkId: string;
    topicId: string;
    articleId?: string;
    userId: string;
    apiKeyId: string;
    content: string;
  };
}

export async function upsertChunkPoints(
  points: QdrantChunkPoint[],
): Promise<void> {
  if (points.length === 0) return;
  await client.upsert(COLLECTION, {
    wait: true,
    points,
  });
}

export async function deleteChunkPoints(filter: {
  topicId?: string;
  articleId?: string;
  apiKeyId?: string;
}): Promise<void> {
  const must: Array<{ key: string; match: { value: string } }> = [];
  if (filter.topicId) {
    must.push({ key: "topicId", match: { value: filter.topicId } });
  }
  if (filter.articleId) {
    must.push({ key: "articleId", match: { value: filter.articleId } });
  }
  if (filter.apiKeyId) {
    must.push({ key: "apiKeyId", match: { value: filter.apiKeyId } });
  }
  if (must.length === 0) return;

  try {
    // Indexes must exist before filtered delete (Qdrant 400 otherwise).
    await ensurePayloadIndexes();
    await client.delete(COLLECTION, {
      wait: true,
      filter: { must },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      return;
    }
    throw error;
  }
}

export interface QdrantChunkSearchHit {
  chunkId: string;
  topicId: string;
  articleId?: string;
  content: string;
  score: number;
}

export async function searchChunkPoints(options: {
  vector: number[];
  apiKeyId: string;
  limit?: number;
  /** Drop Qdrant hits below this cosine similarity (0–1). */
  scoreThreshold?: number;
}): Promise<QdrantChunkSearchHit[]> {
  const limit = options.limit ?? 20;
  const scoreThreshold = options.scoreThreshold;

  try {
    const response = await client.query(COLLECTION, {
      query: options.vector,
      limit,
      with_payload: true,
      ...(typeof scoreThreshold === "number"
        ? { score_threshold: scoreThreshold }
        : {}),
      filter: {
        must: [
          {
            key: "apiKeyId",
            match: { value: options.apiKeyId },
          },
        ],
      },
    });

    return (response.points ?? []).flatMap((point) => {
      const payload = point.payload as QdrantChunkPoint["payload"] | null;
      if (
        !payload?.chunkId ||
        !payload.topicId ||
        typeof payload.content !== "string"
      ) {
        return [];
      }
      return [
        {
          chunkId: payload.chunkId,
          topicId: payload.topicId,
          articleId:
            typeof payload.articleId === "string"
              ? payload.articleId
              : undefined,
          content: payload.content,
          score: point.score ?? 0,
        },
      ];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      return [];
    }
    throw error;
  }
}
