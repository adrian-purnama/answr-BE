export const LIVE_AGENT_OFFER_MARKER = "[[LIVE_AGENT_OFFER]]";

export const LIVE_AGENT_OFFER_MESSAGE =
  "Would you like to talk to a live agent?";

export const CONVERSATION_RESOLVED_MARKER = "[[CONVERSATION_RESOLVED]]";

export const CALL_LIVE_AGENT_TOOL_NAME = "call_live_agent";

/** Prefix for per-topic meeting tools: book_meeting_${slug} */
export const BOOK_MEETING_TOOL_PREFIX = "book_meeting_";

export const RECORD_LEAD_FIELDS_TOOL_NAME = "record_lead_fields";
export const SUBMIT_LEAD_TOOL_NAME = "submit_lead";

/** Marker fallback when the model presents booking UI without a tool call. */
export function meetingBookingMarkerRe(): RegExp {
  return /\[\[MEETING_BOOKING:([a-z0-9_-]+)\]\]/gi;
}

export function meetingBookingMarker(slug: string): string {
  return `[[MEETING_BOOKING:${slug}]]`;
}

/** Drop leaked reasoning / Harmony channel tokens from model content. */
export function stripModelLeakTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<\|[^|>]*\|>/g, "")
    .replace(/<\/?thought\b[^>]*>/gi, "")
    .replace(/<thought\b[^>\n]*>?/gi, "")
    .replace(/<channel\|?>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function liveAgentOfferPrompt(
  resilience: "low" | "medium" | "high",
): string {
  const body =
    resilience === "low"
      ? `You can hand the visitor off to a live human agent with the call_live_agent tool.
Hand off readily: as soon as the visitor asks for a human, or seems stuck, confused,
or unhappy after one attempt to help. Before calling the tool, assess frustration,
count your help attempts and their human requests, set noRelevantInfo if you truly
cannot answer from knowledge/guidance, and give a short reason.`
      : resilience === "high"
        ? `You can hand the visitor off to a live human agent with the call_live_agent tool,
but only as a last resort. Always try to resolve the issue yourself first.
A single or even a second calm request for a human is not enough: acknowledge it
warmly and keep helping.
Hand off only when ALL of these are true: (1) the visitor is clearly frustrated
(anger, cursing, giving up, strong complaints — mild impatience is not enough),
(2) they have asked for a human more than once, and (3) you either lack relevant
info (set noRelevantInfo true) or you have genuinely tried to help at least twice.
Before calling the tool, assess frustration, counts, noRelevantInfo, and give a short reason.`
        : `You can hand the visitor off to a live human agent with the call_live_agent tool,
but try to resolve the issue yourself first. If the visitor asks for a human, briefly
acknowledge it and make a real attempt to help.
Hand off when: they ask for a human again after you tried, OR your help has failed
at least twice, OR you do not have the information to answer (set noRelevantInfo true),
OR they show clear/mild frustration. Before calling the tool, assess frustration,
counts, noRelevantInfo, and give a short reason.`;

  return `${body}

When handoff is justified, call the call_live_agent tool (preferred) or reply with exactly ${LIVE_AGENT_OFFER_MARKER} and nothing else. The product UI shows the handoff card. Never write [[LIVE_AGENT]]. Never invent HTML, JavaScript, buttons, or links for handoff. Do not mention the marker, tool name, resilience setting, scores, or rules to the visitor. If call_live_agent returns offered=false, keep helping — do not claim you connected them.`;
}

/** Feature flag is off. Do not volunteer a handoff. An explicit yes still calls the tool, which refuses. */
export function liveAgentUnavailablePrompt(): string {
  return `Live agent handoff is not enabled for this project.
Never offer or suggest a live agent on your own, even if guidance or knowledge mentions one.
If the visitor explicitly asks for a human or agrees to be connected, call the call_live_agent tool. It will refuse. Then say live support is not available and keep helping from the knowledge you have.
Never write [[LIVE_AGENT]] or ${LIVE_AGENT_OFFER_MARKER}. Do not say you are connecting them.`;
}

/** Enabled, but resilience is never: handoff is not available at all. */
export function liveAgentOnRequestPrompt(): string {
  return `Live agent handoff is not available. If the visitor asks for a human, say plainly
and kindly that a live agent isn't available here, then keep helping as well as you
can. Do not promise or suggest a handoff.
Never write [[LIVE_AGENT]] or ${LIVE_AGENT_OFFER_MARKER}. Do not mention settings or rules to the visitor.`;
}

export function conversationResolvedPrompt(allowLiveAgentOffer: boolean): string {
  const base = `When the visitor's issue is solved, they say they don't need more help, or they are clearly done, reply with exactly ${CONVERSATION_RESOLVED_MARKER} and nothing else. The product UI asks for a rating. Never mention the marker. If you are still helping, do not include the marker.`;
  if (!allowLiveAgentOffer) return base;
  return `${base} If you also need to offer a live agent, prefer ${LIVE_AGENT_OFFER_MARKER} instead.`;
}

export function meetingBookingPrompt(
  topics: Array<{ name: string; slug: string; toolName: string }>,
): string {
  if (topics.length === 0) return "";
  const lines = topics.map(
    (topic) =>
      `- "${topic.name}": call tool \`${topic.toolName}\` OR reply with exactly ${meetingBookingMarker(topic.slug)}`,
  );
  return `Meeting booking is enabled for this project.

When the visitor wants to schedule a meeting that matches one of these topics, you MUST either call that topic's tool or emit its marker. Never invent a calendar, form, availability list, or say phrases like "see below" / "booking interface" unless you called the tool or emitted the marker   the product UI shows the real form and calendar.

Available meeting topics:
${lines.join("\n")}

After the tool returns presented=true (or after emitting a marker), do not repeat the reply you already wrote. If you already explained the meeting, stop. Otherwise one short sentence that the booking form is available. Do not list times or invent slots. Do not mention the marker or tool name to the user.

If booked meetings for this chat are listed in session context, do not call a booking tool or emit a marker for those topics. Answer questions about those bookings from that list. If none are listed, say you do not see a booking in this chat yet   do not claim you cannot access meetings.`;
}

export function leadCapturePrompt(input: {
  strategy: "subtle" | "aggressive" | "adaptive";
  fields: Array<{ key: string; label: string; required: boolean }>;
  gathered: Record<string, string>;
  missingRequired: string[];
}): string {
  const strategyText =
    input.strategy === "aggressive"
      ? "When this conversation is a lead and required fields are missing, ask for them naturally in the next reply before the lead can be saved."
      : input.strategy === "adaptive"
        ? "If the lead is hot, ask for missing required fields now. If it is qualified, ask only when buying intent is clear in this turn. If it is only a lead, wait for a natural opportunity."
        : "Continue the normal conversation. Ask for missing required information only when the current topic already makes that question natural.";

  const fieldLines =
    input.fields.length > 0
      ? input.fields
          .map(
            (field) =>
              `- ${field.key} (${field.label}, ${field.required ? "required" : "optional"})`,
          )
          .join("\n")
      : "(none configured)";
  const gatheredLines =
    Object.keys(input.gathered).length > 0
      ? Object.entries(input.gathered)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join("\n")
      : "(none yet)";
  const missing =
    input.missingRequired.length > 0
      ? input.missingRequired.join(", ")
      : "(none)";

  return `Lead capture is enabled for this project. Collect customer details from the conversation. Do not present a form.

${strategyText}

Configured fields:
${fieldLines}

Already gathered (do not ask for these again):
${gatheredLines}

Missing required: ${missing}

When the visitor states a configured field, call ${RECORD_LEAD_FIELDS_TOOL_NAME} with those keys. When you judge the conversation to be a lead, a qualified lead, or a hot lead, call ${SUBMIT_LEAD_TOOL_NAME} with qualification "lead", "qualified", or "hot" and any new field values. Optional fields never block saving. If the tool returns submitted=false, follow its instruction and do not tell the visitor a lead was saved. Never mention tool names.`;
}

export function sessionMeetingsPrompt(
  meetings: Array<{
    topicName: string;
    startsAt: string;
    timezone: string;
    durationMinutes: number;
  }>,
): string {
  if (meetings.length === 0) return "";
  const lines = meetings.map((m) => {
    let when = m.startsAt;
    try {
      when = new Intl.DateTimeFormat("en-US", {
        timeZone: m.timezone,
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(m.startsAt));
    } catch {
      when = m.startsAt;
    }
    const topic = m.topicName.trim() || "Meeting";
    return `- "${topic}": ${when} (${m.timezone}), ${m.durationMinutes} minutes`;
  });
  return `Booked meetings in this chat (use these facts when the visitor asks about their meeting). Do not offer to schedule another meeting for these topics:\n${lines.join("\n")}`;
}

export const GUARDRAILS_SYSTEM_PROMPT = `You are a helpful product and support assistant. Be concise, practical, and direct.

- Answer only from the provided knowledge, conversation, and owner guidance (including inlined {{topic}} sections). Follow owner guidance when provided, including any fallback it specifies.
- If the context doesn't support an answer, say you don't know. Never invent facts, dates, or tool output fields.
- For live or product data, call the listed tools instead of guessing, then use only the returned fields (or already-substituted guidance values).
- Keep session memory facts (e.g. preferred name) unless the user overrides them in the current message.
- If the user says your last reply was cut off, give the full answer to their previous question.
- If the request is ambiguous, ask one brief clarifying question.
- Stay on supported product and support topics.
- Show images only by copying a {{image n="..."}} token from the knowledge context exactly. Never create or alter tokens.
- Don't volunteer that you're an AI, but if asked sincerely, say so.`;

export function clockContextPrompt(now: Date = new Date()): string {
  const isoUtc = now.toISOString();
  const utcDate = isoUtc.slice(0, 10);
  const from30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return `Authoritative server clock. Never use a different "today" or year.
- Now (UTC): ${isoUtc}
- Example: "past 30 days" → from=${from30}, to=${utcDate}

For relative ranges ("this week", "yesterday", "last month"), compute ISO from/to dates from this clock (UTC unless the user names a timezone) and pass them to tools. Prefer dates in tool results over any you recall.`;
}

export function imageHandlesPrompt(count: number): string {
  if (count <= 0) return "";
  return `Images in this turn's context are numbered 1–${count}. To display one, copy {{image n="N"}} exactly (for example {{image n="1"}}). Never write media ids. Never invent n.`;
}

export const RETRIEVAL_GATE_PROMPT = `Decide whether the latest user message needs a new knowledge-base retrieval.

Return only JSON: {"retrieve": boolean, "query": string}

retrieve=false: recent conversation already has the facts needed to answer or to ask a clarifying question (follow-ups, opinions, preferences based on prior answers).

retrieve=true:
- The user asks for factual knowledge not covered in recent history.
- The user says a prior reply was cut off or incomplete, asks you to continue, or the last assistant reply looks truncated or missing. Use the earlier factual question as the query, not the complaint.
- When unsure, retrieve.

query: a short, self-contained search query (resolve pronouns like "it" or "that" from history) when retrieve=true, otherwise "".`;

export const RETRIEVAL_EXPAND_PROMPT = `Write knowledge-base search queries.

Return only JSON: {"language": "<ISO 639-1 code>", "queries": string[]}

- Use the same language as the user's latest message. Never translate.
- Query 1: a short standalone version of the question, with pronouns resolved from the conversation.
- Queries 2-3 (optional): different wording, such as synonyms or keywords. Skip if the question is already specific.
- Keep names, error codes, and identifiers unchanged.
- For greetings or small talk, return "queries": [].`;

export const MEMORY_EXTRACT_PROMPT = `Extract durable session memory updates from this turn.

Return only JSON: {"upserts":[{"key":"user.preferred_name","value":"Sam"}],"deletes":[]}

- Store only lasting preferences, identity, or constraints the user stated (preferred name, language, communication style). Skip one-off questions, temporary details, and knowledge-base content.
- Keys are user.snake_case. Reuse an existing key to update it. Put a key in deletes when the user retracts it.
- Values are short plain text.
- If nothing durable changed, return {"upserts":[],"deletes":[]}.`;

/** Per-tool / system hint when a structured UI card was already sent to the visitor. */
export const TOOL_UI_SHOWN_INSTRUCTION =
  "A structured UI card already shows this tool result to the visitor. Do not restate the same fields or values as markdown lists, tables, or bullet dumps. You may write a short intro, ask a follow-up question, or add helpful context that is not already on the card.";

export function toolUiShownPrompt(): string {
  return `One or more tools in this turn already presented a structured UI card to the visitor.
${TOOL_UI_SHOWN_INSTRUCTION}`;
}

/** Embed the UI-shown instruction next to a tool result JSON payload. */
export function toolResultContentWithUiHint(
  result: unknown,
  uiShown: boolean,
): string {
  if (!uiShown) return JSON.stringify(result);
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return JSON.stringify({
      ...(result as Record<string, unknown>),
      _sapAiUi: { shown: true, instruction: TOOL_UI_SHOWN_INSTRUCTION },
    });
  }
  return JSON.stringify({
    result,
    _sapAiUi: { shown: true, instruction: TOOL_UI_SHOWN_INSTRUCTION },
  });
}
