import {
  formatImageRef,
  parseContentToBlocks,
  serializeContentBlocks,
} from "./contentReferences";

export type ImageHandle = {
  n: number;
  id: string;
  alt?: string;
};

const IMAGE_TOKEN_RE = /\{\{\s*image\b([^}]*)\}\}/gi;
const ATTR_RE = /(\w+)\s*=\s*(?:"([^"]*)"|([^\s}]+))/g;

function parseLooseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = new RegExp(ATTR_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    if (!key) continue;
    attrs[key] = (match[2] ?? match[3] ?? "").trim();
  }
  return attrs;
}

function formatHandleRef(n: number, alt?: string): string {
  const trimmedAlt = alt?.trim();
  if (trimmedAlt) {
    return `{{image n="${n}" alt="${trimmedAlt.replace(/"/g, "")}"}}`;
  }
  return `{{image n="${n}"}}`;
}

/** First-seen image ids across knowledge, guidance, and history. */
export function buildImageHandleCatalog(texts: string[]): ImageHandle[] {
  const seen = new Set<string>();
  const catalog: ImageHandle[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const block of parseContentToBlocks(text)) {
      if (block.type !== "image") continue;
      const key = block.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({
        n: catalog.length + 1,
        id: block.id,
        ...(block.alt ? { alt: block.alt } : {}),
      });
    }
  }
  return catalog;
}

/** LLM-facing text: real media ids become numbered handles. Unknown ids are dropped. */
export function toLlmImageHandles(
  text: string,
  catalog: ImageHandle[],
): string {
  if (!text) return text;
  const byId = new Map(
    catalog.map((handle) => [handle.id.toLowerCase(), handle]),
  );
  const parts: string[] = [];
  for (const block of parseContentToBlocks(text)) {
    if (block.type !== "image") {
      parts.push(serializeContentBlocks([block]));
      continue;
    }
    const handle = byId.get(block.id.toLowerCase());
    if (!handle) continue;
    parts.push(formatHandleRef(handle.n, block.alt ?? handle.alt));
  }
  return parts.join("");
}

/**
 * Product-facing text: numbered handles become real ids.
 * Invented n / ids are dropped. Whitelisted raw ids are kept.
 */
export function fromLlmImageHandles(
  text: string,
  catalog: ImageHandle[],
): string {
  if (!text) return text;
  const byN = new Map(catalog.map((handle) => [handle.n, handle]));
  const allowedIds = new Set(
    catalog.map((handle) => handle.id.toLowerCase()),
  );

  return text.replace(IMAGE_TOKEN_RE, (_full, inner: string) => {
    const attrs = parseLooseAttrs(inner ?? "");
    const nRaw = attrs.n;
    if (nRaw) {
      const n = Number(nRaw);
      if (!Number.isInteger(n)) return "";
      const handle = byN.get(n);
      if (!handle) return "";
      return formatImageRef(handle.id, attrs.alt || handle.alt);
    }
    const id = attrs.id;
    if (id && allowedIds.has(id.toLowerCase())) {
      const handle = catalog.find(
        (entry) => entry.id.toLowerCase() === id.toLowerCase(),
      );
      return formatImageRef(handle?.id ?? id, attrs.alt || handle?.alt);
    }
    return "";
  });
}
