import { Types } from "mongoose";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "blockquote",
]);

const VOID_TAGS = new Set(["br", "img"]);

function encodeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function mediaIdFromAttrs(attrs: string): string | null {
  const match = attrs.match(/data-media-id\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const id = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return id;
}

function altFromAttrs(attrs: string): string {
  const match = attrs.match(/alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return match?.[1] ?? match?.[2] ?? "";
}

function hrefFromAttrs(attrs: string): string {
  const match = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return decodeAttr(match?.[1] ?? match?.[2] ?? "").trim();
}

export function extractNewsMediaIds(html: string): string[] {
  const ids = new Set<string>();
  const re = /data-media-id\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const id = (match[1] ?? match[2] ?? "").trim();
    if (id && Types.ObjectId.isValid(id)) ids.add(id);
  }
  return [...ids];
}

export function newsExcerpt(html: string, max = 140): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export function isNewsContentEmpty(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .trim();
  if (text) return false;
  return extractNewsMediaIds(html).length === 0;
}

/** Allowlisted HTML. Images keep only data-media-id + alt (no src). */
export function sanitizeNewsHtml(html: string): string {
  let value = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

  value = value.replace(
    /<\/?([a-zA-Z0-9]+)(\s[^>]*)?\/?>/g,
    (full, rawName: string, rawAttrs = "") => {
      const tag = rawName.toLowerCase();
      const closing = full.startsWith("</");
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
      if (tag === "br") return "<br>";
      if (tag === "img") {
        const mediaId = mediaIdFromAttrs(rawAttrs);
        if (!mediaId) return "";
        return `<img data-media-id="${mediaId}" alt="${encodeAttr(altFromAttrs(rawAttrs))}">`;
      }
      if (tag === "a") {
        const href = hrefFromAttrs(rawAttrs);
        if (!isHttpUrl(href)) return "";
        return `<a href="${encodeAttr(href)}" rel="noopener noreferrer" target="_blank">`;
      }
      return `<${tag}>`;
    },
  );

  return value;
}
