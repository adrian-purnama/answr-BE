import { Types } from "mongoose";
import { ArticleModel } from "../models/article/article.model";
import { TopicModel } from "../models/topic/topic.model";

export const REFERENCE_KINDS = [
  "image",
  "topic",
  "tool",
  "tool_variable",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const SUPPORTED_REFERENCE_KINDS: ReadonlySet<string> = new Set(
  REFERENCE_KINDS,
);

export const MAX_IMAGE_ALT = 200;

export type TextBlock = {
  type: "text";
  content: string;
};

export type ImageBlock = {
  type: "image";
  id: string;
  alt?: string;
};

export type TopicBlock = {
  type: "topic";
  id: string;
};

export type ToolBlock = {
  type: "tool";
  name: string;
  /** Output alias for agent bindings, e.g. `plan` in `{{tool name="get_plan" as="plan"}}`. */
  as?: string;
};

/**
 * Field from a tool output alias.
 * `{{tool_variable ref="plan" variable="name"}}` → bindings.plan.name
 */
export type ToolVariableBlock = {
  type: "tool_variable";
  /** Tool output alias (`as` from the tool declaration). */
  ref: string;
  /** Field path under the alias (may be dotted). */
  variable: string;
};

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | TopicBlock
  | ToolBlock
  | ToolVariableBlock;

export type ToolDeclaration = {
  name: string;
  as: string;
};

export type ResolvedTopicContent = {
  topicName: string;
  textContent: string;
  articleId: string;
};

export type TopicReferenceLookup =
  | { status: "resolved"; topic: ResolvedTopicContent }
  | { status: "disabled" }
  | { status: "missing" };

export type ResolveContentOptions = {
  apiKeyId: Types.ObjectId;
  /** How many topic-expansion levels to apply. Default 1. */
  depth?: number;
  /** Defaults: topic true, image false, tool false. */
  expand?: {
    topic?: boolean;
    image?: boolean;
    tool?: boolean;
  };
};

export type ResolveContentUnresolved = {
  kind: ReferenceKind;
  id?: string;
  name?: string;
  reason: "missing" | "disabled" | "depth_exceeded" | "unsupported";
};

export type ResolveContentResult = {
  text: string;
  resolved: {
    topics: Array<{ id: string; name: string; articleId: string }>;
  };
  unresolved: ResolveContentUnresolved[];
};

const TOKEN_RE = /\{\{([^}]+)\}\}/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
const ALIAS_RE = /^[a-zA-Z_][\w]*$/;
const VARIABLE_RE = /^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*$/;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = new RegExp(ATTR_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function tokenToBlock(inner: string): ContentBlock | null {
  const trimmed = inner.trim();
  if (!trimmed) return null;

  const kindMatch = /^(\w+)(.*)$/.exec(trimmed);
  if (!kindMatch) return null;

  const kind = kindMatch[1].toLowerCase();
  const attrs = parseAttrs(kindMatch[2] ?? "");

  if (!SUPPORTED_REFERENCE_KINDS.has(kind)) return null;

  if (kind === "image") {
    const id = attrs.id?.trim();
    if (!id) return null;
    const alt = attrs.alt?.trim().slice(0, MAX_IMAGE_ALT);
    return alt ? { type: "image", id, alt } : { type: "image", id };
  }

  if (kind === "topic") {
    const id = attrs.id?.trim();
    if (!id) return null;
    return { type: "topic", id };
  }

  if (kind === "tool_variable") {
    const ref = attrs.ref?.trim();
    const variable = attrs.variable?.trim();
    if (!ref || !ALIAS_RE.test(ref)) return null;
    if (!variable || !VARIABLE_RE.test(variable)) return null;
    return { type: "tool_variable", ref, variable };
  }

  if (kind === "tool") {
    const name = attrs.name?.trim();
    if (!name) return null;
    const asRaw = attrs.as?.trim();
    const as = asRaw && ALIAS_RE.test(asRaw) ? asRaw : undefined;
    return as ? { type: "tool", name, as } : { type: "tool", name };
  }

  return null;
}

export function parseContentToBlocks(input: string): ContentBlock[] {
  if (!input) return [];

  const blocks: ContentBlock[] = [];
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        content: input.slice(lastIndex, match.index),
      });
    }

    const block = tokenToBlock(match[1] ?? "");
    if (block) {
      blocks.push(block);
    } else {
      blocks.push({ type: "text", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    blocks.push({ type: "text", content: input.slice(lastIndex) });
  }

  return mergeAdjacentText(blocks);
}

function mergeAdjacentText(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.type === "text" && last?.type === "text") {
      last.content += block.content;
    } else {
      out.push(block);
    }
  }
  return out;
}

export function listImageIdsFromContent(input: string): string[] {
  const ids: string[] = [];
  for (const block of parseContentToBlocks(input)) {
    if (block.type === "image") ids.push(block.id);
  }
  return ids;
}

export function countImageBlocks(input: string): number {
  return listImageIdsFromContent(input).length;
}

export function countTopicCharacters(input: string): number {
  let total = 0;
  for (const block of parseContentToBlocks(input)) {
    if (block.type === "text") total += block.content.length;
  }
  return total;
}

function attr(value: string): string {
  return value.replace(/"/g, "");
}

export function formatImageRef(id: string, alt?: string): string {
  const trimmedAlt = alt?.trim().slice(0, MAX_IMAGE_ALT);
  if (trimmedAlt) {
    return `{{image id="${attr(id)}" alt="${attr(trimmedAlt)}"}}`;
  }
  return `{{image id="${attr(id)}"}}`;
}

export function formatTopicRef(topicId: string): string {
  return `{{topic id="${attr(topicId)}"}}`;
}

export function formatToolRef(name: string, as?: string): string {
  const alias = as?.trim();
  if (alias && ALIAS_RE.test(alias)) {
    return `{{tool name="${attr(name)}" as="${attr(alias)}"}}`;
  }
  return `{{tool name="${attr(name)}"}}`;
}

export function formatToolVariableRef(ref: string, variable: string): string {
  return `{{tool_variable ref="${attr(ref.trim())}" variable="${attr(variable.trim())}"}}`;
}

/** Sanitize tool name into a default `as` alias. */
export function defaultToolAlias(toolName: string): string {
  const cleaned = toolName
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "tool";
  if (/^[0-9]/.test(cleaned)) return `t_${cleaned}`;
  return cleaned;
}

export function serializeContentBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "text") return block.content;
      if (block.type === "image") return formatImageRef(block.id, block.alt);
      if (block.type === "topic") return formatTopicRef(block.id);
      if (block.type === "tool_variable") {
        return formatToolVariableRef(block.ref, block.variable);
      }
      return formatToolRef(block.name, block.as);
    })
    .join("");
}

/** First-wins by alias: later duplicate `as` values are skipped.
 *  Missing/invalid `as` falls back to `defaultToolAlias(name)`.
 */
export function listToolDeclarations(input: string): ToolDeclaration[] {
  const seen = new Set<string>();
  const out: ToolDeclaration[] = [];
  for (const block of parseContentToBlocks(input)) {
    if (block.type !== "tool") continue;
    const asRaw = block.as?.trim();
    const as =
      asRaw && ALIAS_RE.test(asRaw) ? asRaw : defaultToolAlias(block.name);
    if (!ALIAS_RE.test(as)) continue;
    const key = as.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: block.name, as });
  }
  return out;
}

export function listToolVariables(
  input: string,
): Array<{ ref: string; variable: string }> {
  const out: Array<{ ref: string; variable: string }> = [];
  const seen = new Set<string>();
  for (const block of parseContentToBlocks(input)) {
    if (block.type !== "tool_variable") continue;
    const key = `${block.ref.toLowerCase()}.${block.variable.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ref: block.ref, variable: block.variable });
  }
  return out;
}

function readBindingField(
  bindings: Record<string, unknown>,
  ref: string,
  variable: string,
): unknown {
  let current: unknown = bindings[ref];
  for (const part of variable.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringifyBindingValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Substitute tool_variable tokens when binding exists; leave unresolved as tokens. */
export function applyVarBindings(
  content: string,
  bindings: Record<string, unknown>,
): string {
  if (!content) return "";
  return serializeContentBlocks(
    parseContentToBlocks(content).map((block) => {
      if (block.type !== "tool_variable") return block;
      const value = readBindingField(bindings, block.ref, block.variable);
      if (value === undefined) return block;
      return { type: "text" as const, content: stringifyBindingValue(value) };
    }),
  );
}

export async function resolveTopicReferences(
  apiKeyId: Types.ObjectId,
  topicIds: string[],
): Promise<Map<string, TopicReferenceLookup>> {
  const result = new Map<string, TopicReferenceLookup>();
  const unique = [
    ...new Set(
      topicIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => id.toLowerCase()),
    ),
  ];

  for (const id of unique) {
    result.set(id, { status: "missing" });
  }
  if (unique.length === 0) return result;

  const objectIds = unique.map((id) => new Types.ObjectId(id));
  const topics = await TopicModel.find({
    _id: { $in: objectIds },
    apiKeyId,
  })
    .select("topicName topicContent enabled articleId")
    .lean();

  const articleIds = [
    ...new Set(
      topics
        .filter((t) => t.articleId)
        .map((t) => t.articleId!.toString()),
    ),
  ].map((id) => new Types.ObjectId(id));

  const articles = await ArticleModel.find({
    _id: { $in: articleIds },
    apiKeyId,
  })
    .select("enabled")
    .lean();

  const articleEnabled = new Map(
    articles.map((a) => [a._id.toString(), a.enabled === true]),
  );

  for (const topic of topics) {
    const id = topic._id.toString().toLowerCase();
    const parentEnabled = topic.articleId
      ? articleEnabled.get(topic.articleId.toString()) === true
      : true;
    if (!topic.enabled || !parentEnabled) {
      result.set(id, { status: "disabled" });
      continue;
    }
    result.set(id, {
      status: "resolved",
      topic: {
        topicName: topic.topicName,
        textContent:
          typeof topic.topicContent === "string" ? topic.topicContent : "",
        articleId: topic.articleId?.toString() ?? "",
      },
    });
  }

  return result;
}

function emptyResolveResult(text = ""): ResolveContentResult {
  return {
    text,
    resolved: { topics: [] },
    unresolved: [],
  };
}

/** One expansion pass over content using a preloaded topic lookup (testable / reusable). */
export function expandContentLevel(
  content: string,
  lookup: Map<string, TopicReferenceLookup>,
  visited: Set<string>,
): {
  text: string;
  expandedAny: boolean;
  newlyResolved: Array<{ id: string; name: string; articleId: string }>;
  unresolved: ResolveContentUnresolved[];
} {
  const blocks = parseContentToBlocks(content);
  const newlyResolved: Array<{ id: string; name: string; articleId: string }> =
    [];
  const unresolved: ResolveContentUnresolved[] = [];
  let text = "";
  let expandedAny = false;

  for (const block of blocks) {
    if (block.type === "text") {
      text += block.content;
      continue;
    }

    if (block.type === "topic") {
      const key = block.id.toLowerCase();
      if (visited.has(key)) {
        text += serializeContentBlocks([block]);
        unresolved.push({
          kind: "topic",
          id: block.id,
          reason: "depth_exceeded",
        });
        continue;
      }

      const hit = lookup.get(key) ?? { status: "missing" as const };
      if (hit.status === "resolved") {
        visited.add(key);
        newlyResolved.push({
          id: block.id,
          name: hit.topic.topicName,
          articleId: hit.topic.articleId,
        });
        text += hit.topic.textContent;
        expandedAny = true;
        continue;
      }

      unresolved.push({
        kind: "topic",
        id: block.id,
        reason: hit.status === "disabled" ? "disabled" : "missing",
      });
      text += serializeContentBlocks([block]);
      continue;
    }

    text += serializeContentBlocks([block]);
  }

  return { text, expandedAny, newlyResolved, unresolved };
}

/**
 * Single shared path for expanding {{topic}} / {{image}} / {{tool}} references.
 * Default: one-level topic expand; images and tools stay as tokens.
 */
export async function resolveContentReferences(
  content: string,
  options: ResolveContentOptions,
): Promise<ResolveContentResult> {
  if (!content) return emptyResolveResult();

  const maxDepth = Math.max(0, options.depth ?? 1);
  const expandTopic = options.expand?.topic !== false;
  const expandImage = options.expand?.image === true;
  const expandTool = options.expand?.tool === true;

  const resolvedTopics = new Map<
    string,
    { id: string; name: string; articleId: string }
  >();
  const unresolved: ResolveContentUnresolved[] = [];
  const unresolvedKeys = new Set<string>();
  const visited = new Set<string>();

  const pushUnresolved = (entry: ResolveContentUnresolved) => {
    const key = `${entry.kind}:${entry.id ?? entry.name ?? ""}:${entry.reason}`;
    if (unresolvedKeys.has(key)) return;
    unresolvedKeys.add(key);
    unresolved.push(entry);
  };

  let current = content;

  if (maxDepth === 0 && expandTopic) {
    for (const block of parseContentToBlocks(current)) {
      if (block.type === "topic") {
        pushUnresolved({
          kind: "topic",
          id: block.id,
          reason: "depth_exceeded",
        });
      }
    }
  }

  for (let level = 0; level < maxDepth; level++) {
    if (!expandTopic) break;

    const blocks = parseContentToBlocks(current);
    const pendingIds = blocks
      .filter((block): block is TopicBlock => block.type === "topic")
      .map((block) => block.id)
      .filter((id) => !visited.has(id.toLowerCase()));

    if (pendingIds.length === 0) break;

    const lookup = await resolveTopicReferences(options.apiKeyId, pendingIds);
    const pass = expandContentLevel(current, lookup, visited);
    for (const topic of pass.newlyResolved) {
      resolvedTopics.set(topic.id.toLowerCase(), topic);
    }
    for (const entry of pass.unresolved) {
      pushUnresolved(entry);
    }
    current = pass.text;
    if (!pass.expandedAny) break;
  }

  if (expandImage || expandTool) {
    for (const block of parseContentToBlocks(current)) {
      if (block.type === "image" && expandImage) {
        pushUnresolved({
          kind: "image",
          id: block.id,
          reason: "unsupported",
        });
      }
      if (block.type === "tool" && expandTool) {
        pushUnresolved({
          kind: "tool",
          name: block.name,
          reason: "unsupported",
        });
      }
    }
  }

  return {
    text: current,
    resolved: { topics: [...resolvedTopics.values()] },
    unresolved,
  };
}
