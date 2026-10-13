import { env } from "../../environment/env";
import type { WahaSessionStatus } from "../../models/apiKey/apiKey.interface";

const TIMEOUT_MS = 8000;

export type WahaSession = {
  name: string;
  status: WahaSessionStatus;
  me: { id?: string; pushName?: string } | null;
};

export type CreateWahaSessionInput = {
  name: string;
  metadata: Record<string, string>;
  webhookUrl: string;
};

export type WahaListMessage = {
  title: string;
  description: string;
  button: string;
  sections: {
    title: string;
    rows: { title: string; rowId: string; description: null }[];
  }[];
};

function sessionWebhooks(webhookUrl: string) {
  return [
    {
      url: webhookUrl,
      events: ["session.status", "message", "poll.vote"],
      customHeaders: [
        {
          name: "X-Webhook-Secret",
          value: env.wahaWebhookSecret,
        },
      ],
    },
  ];
}

function snippet(body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
}

async function wahaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${env.wahaApiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": env.wahaApiKey,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("WAHA request timed out");
    }
    throw new Error("WAHA unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const detail = snippet(text);
  return detail
    ? `WAHA request failed (${response.status}): ${detail}`
    : `WAHA request failed (${response.status})`;
}

function asSession(value: unknown): WahaSession {
  if (!value || typeof value !== "object") {
    throw new Error("WAHA session response was empty");
  }
  const raw = value as Record<string, unknown>;
  const meRaw = raw.me;
  const me =
    meRaw && typeof meRaw === "object"
      ? {
          id:
            typeof (meRaw as { id?: unknown }).id === "string"
              ? (meRaw as { id: string }).id
              : undefined,
          pushName:
            typeof (meRaw as { pushName?: unknown }).pushName === "string"
              ? (meRaw as { pushName: string }).pushName
              : undefined,
        }
      : null;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    status: typeof raw.status === "string" ? raw.status : "UNKNOWN",
    me,
  };
}

export async function getSession(name: string): Promise<WahaSession | null> {
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(name)}`,
    { method: "GET" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return asSession(await response.json());
}

export async function createSession(
  input: CreateWahaSessionInput,
): Promise<WahaSession> {
  const response = await wahaFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      start: true,
      config: {
        metadata: input.metadata,
        webhooks: sessionWebhooks(input.webhookUrl),
      },
    }),
  });
  if (response.ok) return asSession(await response.json());
  const message = await readError(response);
  if (response.status >= 400 && response.status < 500) {
    try {
      const existing = await getSession(input.name);
      if (existing) return existing;
    } catch {
      throw new Error(message);
    }
  }
  throw new Error(message);
}

export async function startSession(name: string): Promise<void> {
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(name)}/start`,
    { method: "POST", body: "" },
  );
  if (response.ok) return;
  // Already running (or another 4xx). Caller re-reads the session.
  if (response.status >= 400 && response.status < 500) return;
  throw new Error(await readError(response));
}

export async function stopSession(
  name: string,
): Promise<"stopped" | "missing"> {
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(name)}/stop`,
    { method: "POST", body: "" },
  );
  if (response.status === 404) return "missing";
  if (!response.ok) throw new Error(await readError(response));
  return "stopped";
}

export async function restartSession(name: string): Promise<void> {
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(name)}/restart`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await readError(response));
}

export async function updateWebhooks(
  name: string,
  webhookUrl: string,
): Promise<void> {
  const response = await wahaFetch(`/api/sessions/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ config: { webhooks: sessionWebhooks(webhookUrl) } }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function sendList(
  session: string,
  chatId: string,
  message: WahaListMessage,
): Promise<void> {
  const response = await wahaFetch("/api/sendList", {
    method: "POST",
    body: JSON.stringify({ session, chatId, reply_to: null, message }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function sendText(
  session: string,
  chatId: string,
  text: string,
): Promise<void> {
  const response = await wahaFetch("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session, chatId, text }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function setPresence(
  session: string,
  chatId: string,
  presence: "typing" | "paused",
): Promise<void> {
  const response = await wahaFetch(
    `/api/${encodeURIComponent(session)}/presence`,
    {
      method: "POST",
      body: JSON.stringify({ chatId, presence }),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
}

export async function logoutSession(name: string): Promise<void> {
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(name)}/logout`,
    { method: "POST", body: "" },
  );
  if (!response.ok) throw new Error(await readError(response));
}

/** PNG bytes. Accept is image/png so this call does not ask for JSON. */
export async function getQrPng(name: string): Promise<Buffer> {
  const response = await wahaFetch(
    `/api/${encodeURIComponent(name)}/auth/qr?format=image`,
    {
      method: "GET",
      headers: { Accept: "image/png" },
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  return Buffer.from(await response.arrayBuffer());
}

export const wahaClient = {
  getSession,
  createSession,
  startSession,
  stopSession,
  restartSession,
  logoutSession,
  updateWebhooks,
  sendList,
  sendText,
  setPresence,
  getQrPng,
};
