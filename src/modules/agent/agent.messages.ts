import type { ChatMessageInterface } from "../../models/message/message.interface";
import type { LlmChatMessage, LlmChatRole } from "../../llm/types";

export function textFromMessage(doc: ChatMessageInterface): string {
  return doc.content
    .filter(
      (block): block is { type: "text"; content: string } =>
        block.type === "text" && typeof block.content === "string",
    )
    .map((block) => block.content)
    .join("");
}

export function toLlmHistory(
  docs: ChatMessageInterface[],
): LlmChatMessage[] {
  const history: LlmChatMessage[] = [];

  for (const doc of docs) {
    if (doc.role !== "user" && doc.role !== "assistant" && doc.role !== "system") {
      continue;
    }
    const content = textFromMessage(doc).trim();
    if (!content) continue;
    const storedReasoning = doc.metadata?.reasoningContent;
    history.push({
      role: doc.role as LlmChatRole,
      content,
      ...(doc.role === "assistant"
        ? {
            reasoningContent:
              typeof storedReasoning === "string" ? storedReasoning : "",
          }
        : {}),
    });
  }

  return history;
}
