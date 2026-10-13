import { Types } from "mongoose";
import { chatWithQuota } from "../../llm/chatWithQuota";
import { logger } from "../../logger/logger";
import { ollamaClient } from "../../llm/ollama/ollamaClient";
import type { LlmChatConfig, LlmChatMessage } from "../../llm/types";
import {
  collectBindNames,
  parseUiRuntimeDesc,
  parseUiTemplateDefinition,
  type UiRuntimeDesc,
  type UiTemplateDefinition,
} from "../../utils/uiDescSchema";
import {
  runtimeAutoUiSystemPrompt,
  templateFromSchemaSystemPrompt,
} from "./uiDescBlockCatalog";
import { normalizeTableHeadersInNode } from "./tableHeaderBind";

const MAX_RESULT_CHARS = 6000;

function truncateJson(value: unknown): string {
  try {
    const raw = JSON.stringify(value, null, 2);
    if (raw.length <= MAX_RESULT_CHARS) return raw;
    return `${raw.slice(0, MAX_RESULT_CHARS)}\n…(truncated)`;
  } catch {
    return String(value);
  }
}

function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/** Coerce common LLM mistakes (numbers/bools in string fields) before Zod parse. */
function coerceUiDescStrings(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(coerceUiDescStrings);
  const record = node as Record<string, unknown>;
  const type = record.type;
  const next: Record<string, unknown> = { ...record };

  if (type === "text" && typeof next.content !== "string") {
    next.content = next.content == null ? "" : String(next.content);
  }
  if (type === "metric") {
    if (typeof next.label !== "string") {
      next.label = next.label == null ? "" : String(next.label);
    }
    if (typeof next.value !== "string") {
      next.value = next.value == null ? "" : String(next.value);
    }
    if (next.unit != null && typeof next.unit !== "string") {
      next.unit = String(next.unit);
    }
  }
  if (type === "metricGrid" && Array.isArray(next.items)) {
    next.items = next.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { label: "", value: "" };
      }
      const row = item as Record<string, unknown>;
      const out: Record<string, unknown> = {
        label: row.label == null ? "" : String(row.label),
        value: row.value == null ? "" : String(row.value),
      };
      if (row.unit != null) out.unit = String(row.unit);
      if (typeof row.bind === "string" && row.bind.trim()) {
        out.bind = row.bind.trim();
      }
      return out;
    });
  }
  if (type === "progress") {
    if (typeof next.value !== "number" || !Number.isFinite(next.value)) {
      next.value = Number(next.value) || 0;
    }
    if (typeof next.max !== "number" || !Number.isFinite(next.max)) {
      next.max = Number(next.max) || 100;
    }
  }
  if (type === "chart" && Array.isArray(next.series)) {
    next.series = next.series.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { label: "", value: 0 };
      }
      const row = item as Record<string, unknown>;
      return {
        label: row.label == null ? "" : String(row.label),
        value:
          typeof row.value === "number" && Number.isFinite(row.value)
            ? row.value
            : Number(row.value) || 0,
      };
    });
  }
  if (type === "keyValue" && Array.isArray(next.rows)) {
    next.rows = next.rows.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return { label: "", value: "" };
      }
      const r = row as Record<string, unknown>;
      const out: Record<string, unknown> = {
        label: r.label == null ? "" : String(r.label),
        value: r.value == null ? "" : String(r.value),
      };
      if (typeof r.bind === "string" && r.bind.trim()) {
        out.bind = r.bind.trim();
      }
      return out;
    });
  }
  if (type === "table") {
    if (Array.isArray(next.headers)) {
      next.headers = next.headers.map((h) => (h == null ? "" : String(h)));
    }
    if (Array.isArray(next.rows)) {
      next.rows = next.rows.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => (cell == null ? "" : String(cell)))
          : [],
      );
    }
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map(coerceUiDescStrings);
  }
  return next;
}

function coerceUiDescRoot(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const desc = parsed as Record<string, unknown>;
  return {
    ...desc,
    version: 1,
    root: coerceUiDescStrings(desc.root),
  };
}

async function chatOnce(
  messages: LlmChatMessage[],
  config: LlmChatConfig,
  userId?: string,
): Promise<string> {
  if (userId && Types.ObjectId.isValid(userId)) {
    return chatWithQuota({
      userId,
      messages,
      temperature: config.temperature ?? 0.1,
      think: config.think,
      logSource: "modules/uiTemplate/generateToolUi.ts",
    });
  }

  // No user id → cannot check quota; stay on Ollama/Bonsai.
  const turn = await ollamaClient.chatTurn(messages, {
    ...config,
    provider: "ollama",
    temperature: config.temperature ?? 0.1,
  });
  return turn.text;
}

/**
 * Ask the turn LLM to invent a validated UiDesc from a tool result.
 * Returns null on any failure (caller keeps markdown-only).
 */
export async function generateToolUiFromResult(options: {
  toolName: string;
  toolDescription?: string;
  toolResult: unknown;
  llmConfig: LlmChatConfig;
  userId?: string;
}): Promise<UiRuntimeDesc | null> {
  const resultJson = truncateJson(options.toolResult);
  const description = (options.toolDescription ?? "").trim();

  const userContent =
    `Tool name: ${options.toolName}\n` +
    (description ? `Tool description: ${description.slice(0, 400)}\n` : "") +
    `Tool result JSON:\n${resultJson}`;

  try {
    const text = await chatOnce(
      [
        { role: "system", content: runtimeAutoUiSystemPrompt() },
        { role: "user", content: userContent },
      ],
      options.llmConfig,
      options.userId,
    );
    const parsed = extractJsonObject(text);
    if (!parsed) {
      logger.warn(
        `Auto UI for "${options.toolName}": model returned non-JSON`,
        "modules/uiTemplate/generateToolUi.ts",
        "generateToolUiFromResult",
      );
      return null;
    }
    const result = parseUiRuntimeDesc(coerceUiDescRoot(parsed));
    if (!result.success) {
      logger.warn(
        `Auto UI for "${options.toolName}": invalid UiDesc (${result.error.issues[0]?.message ?? "unknown"})`,
        "modules/uiTemplate/generateToolUi.ts",
        "generateToolUiFromResult",
      );
      return null;
    }
    logger.info(
      `Auto UI generated for MCP tool "${options.toolName}"`,
      "modules/uiTemplate/generateToolUi.ts",
      "generateToolUiFromResult",
    );
    return result.data;
  } catch (error) {
    logger.warn(
      `Auto UI for "${options.toolName}" failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "modules/uiTemplate/generateToolUi.ts",
      "generateToolUiFromResult",
    );
    return null;
  }
}

export type GenerateUiTemplateFromSchemaResult = {
  definition: UiTemplateDefinition;
  suggestedName: string;
  binds: string[];
};

/**
 * Author a reusable UiDesc template (with binds) from MCP output schema paths.
 */
export async function generateUiTemplateFromOutputSchema(options: {
  toolName: string;
  toolTitle?: string;
  toolDescription?: string;
  outputPaths: string[];
  llmConfig: LlmChatConfig;
  userId?: string;
}): Promise<GenerateUiTemplateFromSchemaResult> {
  const paths = options.outputPaths.map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) {
    throw new Error("Tool has no output schema fields to generate from");
  }

  const title = (options.toolTitle ?? options.toolName).trim() || options.toolName;
  const description = (options.toolDescription ?? "").trim();
  const userContent =
    `Tool name: ${options.toolName}\n` +
    `Tool title: ${title}\n` +
    (description ? `Tool description: ${description.slice(0, 500)}\n` : "") +
    `Output field paths (use these as bind names):\n${paths.map((p) => `- ${p}`).join("\n")}`;

  const text = await chatOnce(
    [
      { role: "system", content: templateFromSchemaSystemPrompt() },
      { role: "user", content: userContent },
    ],
    options.llmConfig,
    options.userId,
  );

  const parsed = extractJsonObject(text);
  if (!parsed) {
    throw new Error("Model returned non-JSON for UI template");
  }

  const coerced = coerceUiDescRoot(parsed);
  // Deterministic fix-up: LLM table headers often don't camelCase to schema keys
  // (e.g. "Price/Month" ≠ pricePerMonth). Rewrite from output paths before validate.
  if (coerced && typeof coerced === "object" && !Array.isArray(coerced)) {
    const root = (coerced as { root?: unknown }).root;
    if (root != null) normalizeTableHeadersInNode(root, paths);
  }

  const result = parseUiTemplateDefinition(coerced);
  if (!result.success) {
    throw new Error(
      `Invalid UI template: ${result.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  const binds = [...collectBindNames(result.data.root)];
  const suggestedName = `${title} UI`.slice(0, 80);

  logger.info(
    `AI Create UI template for MCP tool "${options.toolName}" (${binds.length} binds)`,
    "modules/uiTemplate/generateToolUi.ts",
    "generateUiTemplateFromOutputSchema",
  );

  return {
    definition: result.data,
    suggestedName,
    binds,
  };
}
