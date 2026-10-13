export interface PlanInterface {
    slug: string;
    name: string;
    description: string;

    pricePerMonth: number;
    priceLabel: number;
    priceNote: string;

    maxApiKeys: number;
    maxRequestsPerMinute: number;

    /** Maximum articles per project (API key) */
    maxArticles: number;

    /** Maximum topics allowed inside a single article */
    maxTopicsPerArticle: number;

    /** Maximum image blocks allowed inside a single topic */
    maxImagesPerTopic: number;

    /** Maximum text characters allowed inside a single topic */
    maxCharactersPerTopic: number;

    /** Maximum standalone snippets per project (API key) */
    maxSnippets: number;

    /** Maximum image blocks allowed inside a single snippet */
    maxImagesPerSnippet: number;

    /** Maximum text characters allowed inside a single snippet */
    maxCharactersPerSnippet: number;

    /** Maximum guidance documents per project (API key) */
    maxGuidances: number;

    /** Maximum text characters allowed inside a single guidance */
    maxCharactersPerGuidance: number;

    /** Maximum live agents per project (API key) */
    maxLiveAgents: number;

    /** Whether Live Agent handoff is included in this plan */
    liveAgent: boolean;

    /** Whether the Meeting Tool is included in this plan */
    meetingTool: boolean;

    /** Whether Customer Data & Lead Capture is included in this plan */
    leadCapture: boolean;

    /** Whether WhatsApp channel is included in this plan */
    whatsApp: boolean;

    /** Maximum meeting topics per project (API key) */
    maxMeetingTopics: number;

    /** Maximum batch test groups per project (API key) */
    batchTestGroupAmount: number;

    /** Maximum questions allowed inside a single batch test group */
    questionsPerBatchTestGroup: number;

    /**
     * How many days of chat analytics history this plan may query.
     * Enforced server-side on all analytics reporting endpoints.
     */
    analyticsLookbackDays: number;

    /**
     * Soft DeepSeek token budget for one quota window (not a calendar month).
     * Input + output tokens are summed. 0 keeps the agent on local Ollama.
     * Window length is controlled by quotaWindowDays (null = whole plan period).
     */
    deepseekQuotaPerPeriod: number;

    /**
     * Days per quota window within a plan period. null = the whole period is
     * one window. Open-ended periods treat null as 30.
     */
    quotaWindowDays: number | null;

    accentColor: string;
    order: number;
    showOnPricingPage: boolean;

    isDefaultPlan: boolean;
    isActive: boolean;

    createdAt: Date;
    updatedAt: Date;
}
