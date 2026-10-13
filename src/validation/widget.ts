import type { UpdateWidgetDto } from "../dto/widget.dto";
import type {
  HomeFaqEntry,
  HomeSectionElement,
  VisitorJwtAlgorithm,
  WidgetAccessMode,
  WidgetChatSettings,
  WidgetFaqSettings,
  WidgetHomeSettings,
  WidgetLoginPrompt,
  WidgetSectionSettings,
} from "../models/widget/widget.interface";
import {
  DEFAULT_HOME_GREETING,
  DEFAULT_LOGIN_PROMPT_MESSAGE,
  HOME_SECTION_TYPE_VALUES,
  VISITOR_JWT_ALGORITHM_VALUES,
  WIDGET_ACCESS_MODE_VALUES,
} from "../models/widget/widget.interface";

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function parseAccessMode(value: unknown): WidgetAccessMode {
  // Accept legacy "any" from older clients as "both"
  if (value === "any") {
    return "both";
  }
  if (
    typeof value !== "string" ||
    !(WIDGET_ACCESS_MODE_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `accessMode must be one of: ${WIDGET_ACCESS_MODE_VALUES.join(", ")}`,
    );
  }
  return value as WidgetAccessMode;
}

function parseVisitorJwtAlgorithm(value: unknown): VisitorJwtAlgorithm {
  if (
    typeof value !== "string" ||
    !(VISITOR_JWT_ALGORITHM_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `visitorJwtAlgorithm must be one of: ${VISITOR_JWT_ALGORITHM_VALUES.join(", ")}`,
    );
  }
  return value as VisitorJwtAlgorithm;
}

function parseLoginPrompt(
  value: unknown,
): Partial<WidgetLoginPrompt> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("loginPrompt must be an object");
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<WidgetLoginPrompt> = {};
  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "loginPrompt.enabled");
  }
  if ("message" in raw) {
    if (typeof raw.message !== "string") {
      throw new Error("loginPrompt.message must be a string");
    }
    const trimmed = raw.message.trim();
    patch.message = trimmed || DEFAULT_LOGIN_PROMPT_MESSAGE;
  }
  if ("loginLink" in raw) {
    if (typeof raw.loginLink !== "string") {
      throw new Error("loginPrompt.loginLink must be a string");
    }
    const trimmed = raw.loginLink.trim();
    if (trimmed) {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new Error("loginPrompt.loginLink must be a valid URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("loginPrompt.loginLink must be an http(s) URL");
      }
      patch.loginLink = trimmed;
    } else {
      patch.loginLink = "";
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("loginPrompt must include at least one valid field");
  }
  return patch;
}

function parseString(value: unknown, field: string, allowEmpty = true): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return allowEmpty ? value : trimmed;
}

function parseId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseNumber(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} must be a number`);
  }
  const result = opts.integer ? Math.floor(num) : num;
  if (opts.min !== undefined && result < opts.min) {
    throw new Error(`${field} must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && result > opts.max) {
    throw new Error(`${field} must be <= ${opts.max}`);
  }
  return result;
}

function parseAllowedDomains(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("allowedDomains must be an array of strings");
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`allowedDomains[${index}] must be a non-empty string`);
    }
    let domain = item.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "");
    domain = domain.split("/")[0] ?? domain;
    if (!domain) {
      throw new Error(`allowedDomains[${index}] must be a non-empty string`);
    }
    return domain;
  });
}

function parseTabSettings(
  value: unknown,
  field: string,
): Partial<WidgetSectionSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<WidgetSectionSettings> = {};

  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, `${field}.enabled`);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error(`${field} must include at least one valid field`);
  }

  return patch;
}

export function defaultFaqSettings(): WidgetFaqSettings {
  return {
    enabled: true,
    title: "Help",
    enableSearch: true,
    searchPlaceholder: "Search for help",
    entries: [],
  };
}

export function coerceFaqSettings(value: unknown): WidgetFaqSettings {
  const defaults = defaultFaqSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }
  const raw = value as Record<string, unknown>;
  let entries: HomeFaqEntry[] = defaults.entries;
  try {
    if ("entries" in raw || "articleIds" in raw) {
      entries = parseFaqEntries(raw, "faqSettings");
    }
  } catch {
    entries = defaults.entries;
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    ...(typeof raw.title === "string" && raw.title.trim()
      ? { title: raw.title.trim() }
      : { title: defaults.title }),
    enableSearch:
      typeof raw.enableSearch === "boolean"
        ? raw.enableSearch
        : defaults.enableSearch,
    ...(typeof raw.searchPlaceholder === "string" && raw.searchPlaceholder.trim()
      ? { searchPlaceholder: raw.searchPlaceholder.trim() }
      : { searchPlaceholder: defaults.searchPlaceholder }),
    entries,
  };
}

function parseFaqSettings(value: unknown): Partial<WidgetFaqSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("faqSettings must be an object");
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<WidgetFaqSettings> = {};

  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "faqSettings.enabled");
  }
  if ("title" in raw) {
    patch.title = parseString(raw.title, "faqSettings.title", true);
  }
  if ("enableSearch" in raw) {
    patch.enableSearch = parseBoolean(
      raw.enableSearch,
      "faqSettings.enableSearch",
    );
  }
  if ("searchPlaceholder" in raw) {
    patch.searchPlaceholder = parseString(
      raw.searchPlaceholder,
      "faqSettings.searchPlaceholder",
      true,
    );
  }
  if ("entries" in raw || "articleIds" in raw) {
    patch.entries = parseFaqEntries(raw, "faqSettings");
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("faqSettings must include at least one valid field");
  }

  return patch;
}

export function defaultChatSettings(): WidgetChatSettings {
  return {
    enabled: true,
    initialQuestions: [],
    enableFollowupQuestions: true,
    agentProfilePicture: "",
    agentDescription: "The team can also help",
    agentInitialMessage: "Hi, you're speaking with our AI Agent.",
    agentName: "AI Agent",
  };
}

export function parseChatSettings(
  value: unknown,
): Partial<WidgetChatSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("chatSettings must be an object");
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<WidgetChatSettings> = {};

  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "chatSettings.enabled");
  }
  if ("enableFollowupQuestions" in raw) {
    patch.enableFollowupQuestions = parseBoolean(
      raw.enableFollowupQuestions,
      "chatSettings.enableFollowupQuestions",
    );
  }
  if ("agentProfilePicture" in raw) {
    patch.agentProfilePicture = parseString(
      raw.agentProfilePicture,
      "chatSettings.agentProfilePicture",
    );
  }
  if ("agentDescription" in raw) {
    patch.agentDescription = parseString(
      raw.agentDescription,
      "chatSettings.agentDescription",
    );
  }
  if ("agentInitialMessage" in raw) {
    patch.agentInitialMessage = parseString(
      raw.agentInitialMessage,
      "chatSettings.agentInitialMessage",
    );
  }
  if ("agentName" in raw) {
    patch.agentName = parseString(raw.agentName, "chatSettings.agentName", false);
  }
  if ("initialQuestions" in raw) {
    if (!Array.isArray(raw.initialQuestions)) {
      throw new Error("chatSettings.initialQuestions must be an array");
    }
    patch.initialQuestions = raw.initialQuestions.map((item, index) => {
      if (typeof item !== "string") {
        throw new Error(
          `chatSettings.initialQuestions[${index}] must be a string`,
        );
      }
      return item.trim();
    }).filter(Boolean);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("chatSettings must include at least one valid field");
  }

  return patch;
}

export function coerceChatSettings(value: unknown): WidgetChatSettings {
  const defaults = defaultChatSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }
  const raw = value as Record<string, unknown>;
  const initialQuestions = Array.isArray(raw.initialQuestions)
    ? raw.initialQuestions
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : defaults.initialQuestions;

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    initialQuestions,
    enableFollowupQuestions:
      typeof raw.enableFollowupQuestions === "boolean"
        ? raw.enableFollowupQuestions
        : defaults.enableFollowupQuestions,
    agentProfilePicture:
      typeof raw.agentProfilePicture === "string"
        ? raw.agentProfilePicture
        : defaults.agentProfilePicture,
    agentDescription:
      typeof raw.agentDescription === "string"
        ? raw.agentDescription
        : defaults.agentDescription,
    agentInitialMessage:
      typeof raw.agentInitialMessage === "string"
        ? raw.agentInitialMessage
        : defaults.agentInitialMessage,
    agentName:
      typeof raw.agentName === "string" && raw.agentName.trim()
        ? raw.agentName.trim()
        : defaults.agentName,
  };
}


function parseFaqEntries(raw: Record<string, unknown>, field: string): HomeFaqEntry[] {
  if (Array.isArray(raw.entries)) {
    return raw.entries.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`${field}.entries[${index}] must be an object`);
      }
      const row = item as Record<string, unknown>;
      const articleId = parseId(row.articleId, `${field}.entries[${index}].articleId`);
      if (!Array.isArray(row.topicIds)) {
        throw new Error(`${field}.entries[${index}].topicIds must be an array`);
      }
      const topicIds = row.topicIds.map((topicId, topicIndex) => {
        if (typeof topicId !== "string" || !topicId.trim()) {
          throw new Error(
            `${field}.entries[${index}].topicIds[${topicIndex}] must be a non-empty string`,
          );
        }
        return topicId.trim();
      });
      return { articleId, topicIds };
    });
  }

  if (Array.isArray(raw.articleIds)) {
    return raw.articleIds.map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        throw new Error(
          `${field}.articleIds[${index}] must be a non-empty string`,
        );
      }
      return { articleId: item.trim(), topicIds: [] };
    });
  }

  throw new Error(`${field}.entries must be an array`);
}

function parseHomeElement(value: unknown, field: string): HomeSectionElement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const id = parseId(raw.id, `${field}.id`);
  const type = raw.type;

  if (
    typeof type !== "string" ||
    !(HOME_SECTION_TYPE_VALUES as readonly string[]).includes(type)
  ) {
    throw new Error(
      `${field}.type must be one of: ${HOME_SECTION_TYPE_VALUES.join(", ")}`,
    );
  }

  switch (type) {
    case "goToChat":
      return {
        id,
        type: "goToChat",
        label: parseString(raw.label, `${field}.label`, false),
        ...(raw.subtitle !== undefined
          ? { subtitle: parseString(raw.subtitle, `${field}.subtitle`) }
          : {}),
      };
    case "latestNews": {
      const limit = parseNumber(raw.limit, `${field}.limit`, {
        min: 1,
        max: 50,
        integer: true,
      });
      return {
        id,
        type: "latestNews",
        ...(raw.title !== undefined
          ? { title: parseString(raw.title, `${field}.title`) }
          : {}),
        limit,
      };
    }
    case "faq":
      return {
        id,
        type: "faq",
        ...(raw.title !== undefined
          ? { title: parseString(raw.title, `${field}.title`) }
          : {}),
        ...(raw.enableSearch !== undefined
          ? {
              enableSearch: parseBoolean(
                raw.enableSearch,
                `${field}.enableSearch`,
              ),
            }
          : {}),
        ...(raw.searchPlaceholder !== undefined
          ? {
              searchPlaceholder: parseString(
                raw.searchPlaceholder,
                `${field}.searchPlaceholder`,
              ),
            }
          : {}),
        entries: parseFaqEntries(raw, field),
      };
    case "linkCard":
      return {
        id,
        type: "linkCard",
        ...(raw.title !== undefined
          ? { title: parseString(raw.title, `${field}.title`) }
          : {}),
        label: parseString(raw.label, `${field}.label`, false),
        url: parseString(raw.url, `${field}.url`, false),
        ...(raw.openInNewTab !== undefined
          ? {
              openInNewTab: parseBoolean(
                raw.openInNewTab,
                `${field}.openInNewTab`,
              ),
            }
          : {}),
      };
    default:
      throw new Error(`${field}.type is invalid`);
  }
}

function migrateGreeting(raw: Record<string, unknown>): string {
  if (typeof raw.greeting === "string" && raw.greeting.trim()) {
    return raw.greeting.trim();
  }
  if (Array.isArray(raw.elements)) {
    for (const item of raw.elements) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const el = item as Record<string, unknown>;
      if (
        (el.type === "heading" || el.type === "paragraph") &&
        typeof el.text === "string" &&
        el.text.trim()
      ) {
        return el.text.trim();
      }
    }
  }
  return DEFAULT_HOME_GREETING;
}

function parseOptionalGreetingColor(
  raw: Record<string, unknown>,
): { greetingColor?: string } {
  const value = raw.greetingColor;
  if (value === undefined || value === null || value === "") {
    return {};
  }
  if (typeof value !== "string") {
    throw new Error("homeSettings.greetingColor must be a string");
  }
  const trimmed = value.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    throw new Error(
      "homeSettings.greetingColor must be a hex color (#RGB or #RRGGBB)",
    );
  }
  return { greetingColor: trimmed };
}

export function parseHomeSettings(value: unknown): WidgetHomeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("homeSettings must be an object");
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.elements)) {
    throw new Error("homeSettings.elements must be an array");
  }

  return {
    enabled: parseBoolean(raw.enabled, "homeSettings.enabled"),
    logo: parseString(raw.logo ?? "", "homeSettings.logo"),
    greeting: migrateGreeting(raw),
    ...parseOptionalGreetingColor(raw),
    backgroundImage: parseString(
      raw.backgroundImage ?? "",
      "homeSettings.backgroundImage",
    ),
    backgroundDim: parseNumber(raw.backgroundDim ?? 0, "homeSettings.backgroundDim", {
      min: 0,
      max: 100,
    }),
    elements: raw.elements.map((element, index) =>
      parseHomeElement(element, `homeSettings.elements[${index}]`),
    ),
  };
}

export function defaultHomeSettings(): WidgetHomeSettings {
  return {
    enabled: true,
    logo: "",
    greeting: DEFAULT_HOME_GREETING,
    backgroundImage: "",
    backgroundDim: 0,
    elements: [],
  };
}

/** Lenient read path   drops legacy freeform elements and invalid rows. */
export function coerceHomeSettings(value: unknown): WidgetHomeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultHomeSettings();
  }
  const raw = value as Record<string, unknown>;
  const backgroundDim =
    typeof raw.backgroundDim === "number" && Number.isFinite(raw.backgroundDim)
      ? Math.min(100, Math.max(0, raw.backgroundDim))
      : 0;
  const greeting = migrateGreeting(raw);
  let greetingColor: string | undefined;
  try {
    greetingColor = parseOptionalGreetingColor(raw).greetingColor;
  } catch {
    greetingColor = undefined;
  }
  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements: HomeSectionElement[] = [];
  for (let index = 0; index < rawElements.length; index += 1) {
    try {
      elements.push(
        parseHomeElement(rawElements[index], `homeSettings.elements[${index}]`),
      );
    } catch {
      // skip legacy / invalid section
    }
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    logo: typeof raw.logo === "string" ? raw.logo : "",
    greeting,
    ...(greetingColor ? { greetingColor } : {}),
    backgroundImage:
      typeof raw.backgroundImage === "string" ? raw.backgroundImage : "",
    backgroundDim,
    elements,
  };
}

export function parseUpdateWidgetDto(body: unknown): UpdateWidgetDto {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }

  const raw = body as Record<string, unknown>;
  const patch: UpdateWidgetDto = {};

  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "enabled");
  }
  if ("darkMode" in raw) {
    patch.darkMode = parseBoolean(raw.darkMode, "darkMode");
  }
  if ("badgeImage" in raw) {
    patch.badgeImage = parseString(raw.badgeImage, "badgeImage", true);
  }
  if ("accessMode" in raw) {
    patch.accessMode = parseAccessMode(raw.accessMode);
  } else if ("authentication" in raw) {
    // Legacy client field
    patch.accessMode = parseAccessMode(raw.authentication);
  }
  if ("loginPrompt" in raw) {
    patch.loginPrompt = parseLoginPrompt(raw.loginPrompt);
  }
  if ("visitorJwtPublicKeyPem" in raw) {
    patch.visitorJwtPublicKeyPem = parseString(
      raw.visitorJwtPublicKeyPem,
      "visitorJwtPublicKeyPem",
      true,
    );
  }
  if ("visitorJwtAlgorithm" in raw) {
    patch.visitorJwtAlgorithm = parseVisitorJwtAlgorithm(
      raw.visitorJwtAlgorithm,
    );
  }
  if ("visitorJwtIssuer" in raw) {
    patch.visitorJwtIssuer = parseString(
      raw.visitorJwtIssuer,
      "visitorJwtIssuer",
      true,
    ).trim();
  }
  if ("allowedDomains" in raw) {
    patch.allowedDomains = parseAllowedDomains(raw.allowedDomains);
  }
  if ("homeSettings" in raw) {
    patch.homeSettings = parseHomeSettings(raw.homeSettings);
  }
  if ("chatSettings" in raw) {
    patch.chatSettings = parseChatSettings(raw.chatSettings);
  }
  if ("faqSettings" in raw) {
    patch.faqSettings = parseFaqSettings(raw.faqSettings);
  }
  if ("newsSettings" in raw) {
    patch.newsSettings = parseTabSettings(raw.newsSettings, "newsSettings");
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseCreatePublicChatSessionDto(body: unknown): {
  visitorToken?: string;
} {
  if (body === undefined || body === null || body === "") {
    return {};
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (!("visitorToken" in raw) || raw.visitorToken === undefined) {
    return {};
  }
  if (typeof raw.visitorToken !== "string" || !raw.visitorToken.trim()) {
    throw new Error("visitorToken must be a non-empty string");
  }
  return { visitorToken: raw.visitorToken.trim() };
}

export function parseBindVisitorIdentityDto(body: unknown): {
  visitorToken: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.visitorToken !== "string" || !raw.visitorToken.trim()) {
    throw new Error("visitorToken must be a non-empty string");
  }
  return { visitorToken: raw.visitorToken.trim() };
}
