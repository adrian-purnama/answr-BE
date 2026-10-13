import {
  ARTICLE_DESCRIPTION_MAX,
  ARTICLE_TITLE_MAX,
} from "../models/article/article.model";
import { TOPIC_NAME_MAX } from "../models/topic/topic.model";
import {
  parseContentToBlocks,
  serializeContentBlocks,
  type ContentBlock,
} from "./contentReferences";

export type ParsedMarkdownTopic = {
  topicName: string;
  topicContent: string;
};

export type ParsedMarkdownArticle = {
  title: string;
  description: string;
  topics: ParsedMarkdownTopic[];
};

const IMAGE_MD_RE = /^!\[([^\]]*)\]\((images\/([^)\s]+))\)\s*$/;

function extFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "bin";
  return filename.slice(dot + 1).toLowerCase() || "bin";
}

/** Prefer known mediaId.ext; fall back to mediaId.png */
export function imageMarkdownRef(
  mediaId: string,
  filenameHint?: string,
  alt?: string,
): string {
  const ext = filenameHint ? extFromFilename(filenameHint) : "png";
  const label = (alt?.trim() || "image").replace(/[\[\]]/g, "");
  return `![${label}](images/${mediaId}.${ext})`;
}

function serializeTopicContent(content: string): string {
  const lines: string[] = [];
  for (const block of parseContentToBlocks(content)) {
    if (block.type === "text") {
      const text = block.content.trimEnd();
      if (text) lines.push(text);
    } else if (block.type === "image") {
      lines.push(imageMarkdownRef(block.id, undefined, block.alt));
    } else if (block.type === "topic") {
      lines.push(serializeContentBlocks([block]));
    } else if (block.type === "tool") {
      lines.push(serializeContentBlocks([block]));
    }
  }
  return lines.join("\n\n").trim();
}

function parseTopicBody(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const blocks: ContentBlock[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    const content = textBuf.join("\n").trim();
    if (content) blocks.push({ type: "text", content });
    textBuf = [];
  };

  for (const line of lines) {
    const match = line.match(IMAGE_MD_RE);
    if (match) {
      flushText();
      const altRaw = match[1]?.trim() ?? "";
      const alt =
        altRaw && altRaw !== "image" ? altRaw.slice(0, 200) : undefined;
      const filePart = match[3];
      const mediaId = filePart.includes(".")
        ? filePart.slice(0, filePart.lastIndexOf("."))
        : filePart;
      if (mediaId) {
        blocks.push({
          type: "image",
          id: mediaId,
          ...(alt ? { alt } : {}),
        });
      }
      continue;
    }
    textBuf.push(line);
  }
  flushText();
  return serializeContentBlocks(blocks);
}

/**
 * Serialize article + ordered topics to the canonical Markdown protocol.
 * `# Title`, then optional description paragraphs, then `### Topic` sections.
 * Image tokens become `![alt](images/<id>.ext)` (alt defaults to `image`).
 */
export function serializeArticleMarkdown(
  title: string,
  topics: ParsedMarkdownTopic[],
  description = "",
): string {
  const parts: string[] = [`# ${title.trim()}`, ""];

  const desc = description.trim();
  if (desc) {
    parts.push(desc, "");
  }

  for (const topic of topics) {
    parts.push(`### ${topic.topicName.trim()}`, "");
    const body = serializeTopicContent(topic.topicContent);
    if (body) {
      parts.push(body, "");
    }
  }

  return parts.join("\n").trimEnd() + "\n";
}

/**
 * Parse Markdown: first H1 → title; text until first H3 → description;
 * each H3 → topic; content between H3s → topic body (text + image refs).
 */
export function parseArticleMarkdown(markdown: string): ParsedMarkdownArticle {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new Error("Markdown is empty");
  }

  const lines = text.split("\n");
  let title: string | null = null;
  const descriptionLines: string[] = [];
  const topics: ParsedMarkdownTopic[] = [];
  let currentName: string | null = null;
  let currentBody: string[] = [];
  let sawFirstTopic = false;

  const flushTopic = () => {
    if (currentName === null) return;
    const name = currentName.trim();
    if (name) {
      topics.push({
        topicName: name,
        topicContent: parseTopicBody(currentBody.join("\n")),
      });
    }
    currentName = null;
    currentBody = [];
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && title === null && currentName === null && !sawFirstTopic) {
      title = h1[1].trim();
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      flushTopic();
      sawFirstTopic = true;
      currentName = h3[1];
      continue;
    }

    if (currentName !== null) {
      currentBody.push(line);
      continue;
    }

    if (title !== null && !sawFirstTopic) {
      descriptionLines.push(line);
    }
  }

  flushTopic();

  if (!title) {
    throw new Error("Markdown must start with an H1 article title (# Title)");
  }
  if (title.length > ARTICLE_TITLE_MAX) {
    throw new Error(`title must be at most ${ARTICLE_TITLE_MAX} characters`);
  }

  const description = descriptionLines.join("\n").trim();
  if (description.length > ARTICLE_DESCRIPTION_MAX) {
    throw new Error(
      `description must be at most ${ARTICLE_DESCRIPTION_MAX} characters`,
    );
  }

  for (const topic of topics) {
    if (topic.topicName.length > TOPIC_NAME_MAX) {
      throw new Error(`topicName must be at most ${TOPIC_NAME_MAX} characters`);
    }
  }

  return {
    title,
    description,
    topics,
  };
}
