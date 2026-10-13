# Graph Report - backend  (2026-10-06)

## Corpus Check
- 332 files · ~166,342 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2983 nodes · 8558 edges · 134 communities (123 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- article.service.ts
- index.ts
- user.service.ts
- auth.service.ts
- admin.controller.ts
- devDependencies
- apiKey.service.ts
- article.controller.ts
- AppConfig.service.ts
- entitlement.service.ts
- jobValidation.ts
- job.dto.ts
- dependencies
- JobWorkerService
- modelRegistry.ts
- jobWorkerService.ts
- jsonOutputGuard.ts
- tsconfig.json
- ollamaClient.ts
- JobService
- OllamaClient
- widget.model.ts
- PUBLIC_CAPABILITIES
- deepseekClient.ts
- WidgetService
- articleBucket.ts
- widget.service.ts
- widget.controller.ts
- message.interface.ts
- agent.graph.ts
- widgetValidation.ts
- agent.service.ts
- mcp.interface.ts
- plan.service.ts
- AppConfigService
- AuthController
- job.dto.ts
- mail.service.ts
- createLlmProvider.ts
- logger.ts
- AdminService
- .chunkArticle
- topicValidation.ts
- UserModel
- agent.memory.ts
- scripts
- OllamaClient
- package.json
- topic.model.ts
- @langchain/langgraph
- sharp-phash
- zod
- chatAnalytics.service.ts
- mongoose
- requireApiKeyAccess.ts
- bcrypt
- chatAnalytics.controller.ts
- ChatAnalyticsService
- agent.state.ts
- meetingTool.ts
- apiKeyCollaborator.service.ts
- apiKeyCollaborator.controller.ts
- user.service.ts
- parseApiKeyId
- buildLlmMessages
- plan.service.ts
- apiKeyCollaborator.interface.ts
- MeetingToolService
- guidance.controller.ts
- socket.ts
- ChatAnalyticsDailyModel
- topic.ts
- rerankerClient.ts
- OllamaClient
- McpController
- UserModel
- meetingTool.model.ts
- meetingTool.controller.ts
- .sendOtp
- chatSession.model.ts
- GuidanceController
- widget.route.ts
- fetchRemoteImage.ts
- apiKey.ts
- message.model.ts
- article.route.ts
- apiKey.route.ts
- apiKeyCollaborator.service.test.ts
- WidgetService
- AppConfig.route.ts
- guidance.service.test.ts
- batchTest.route.ts
- widget.ts
- @modelcontextprotocol/client
- MeetingToolConfigModel
- applyUiFieldMap.ts
- leadCapture.policy.ts
- migrateNestedSettings.ts
- article.ts
- apiKeyCollaborationInvite.controller.ts
- widget.model.ts
- chatSession.model.ts
- parseUpdateApiKeyDto
- GuidanceController
- jsonSchemaPaths.ts
- multer
- sharp
- DeepseekClient
- user.route.ts
- liveAgentFrustration.ts
- widget.route.ts
- apiKey.route.ts
- snippet.route.ts
- plan.route.ts
- verifyPublicSessionId
- guidance.route.ts
- LlmTokenUsage
- agent.route.ts
- meetingTool.route.ts
- express
- socket.io
- @types/node
- .updateSettings
- .applyMidtransStatus
- payment.config.ts
- invoice.model.ts
- parseRouteId
- bcrypt
- mongodb-memory-server
- @qdrant/js-client-rest
- DEFAULT_SYNC_LOCK_TTL_MS

## God Nodes (most connected - your core abstractions)
1. `statusForMessage()` - 168 edges
2. `getApiKeyScope()` - 120 edges
3. `parseApiKeyIdQuery()` - 86 edges
4. `ApiKeyModel` - 65 edges
5. `parseApiKeyId()` - 54 edges
6. `EntitlementService` - 51 edges
7. `UserModel` - 44 edges
8. `logger` - 43 edges
9. `TopicModel` - 42 edges
10. `parseParam()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `updatePublicFile()` --indirect_call--> `session()`  [INFERRED]
  src/buckets/publicBucket.ts → src/modules/whatsApp/whatsApp.service.test.ts
- `findOverlappingPeriod()` --indirect_call--> `period()`  [INFERRED]
  src/modules/userPlanPeriod/planPeriod.overlap.ts → src/modules/userPlanPeriod/userPlanPeriod.service.test.ts
- `uploadArticleFile()` --calls--> `uploadFile()`  [EXTRACTED]
  src/buckets/articleBucket.ts → src/buckets/gridfs.ts
- `deleteArticleFile()` --calls--> `deleteFile()`  [EXTRACTED]
  src/buckets/articleBucket.ts → src/buckets/gridfs.ts
- `openArticleDownload()` --calls--> `openDownload()`  [EXTRACTED]
  src/buckets/articleBucket.ts → src/buckets/gridfs.ts

## Import Cycles
- None detected.

## Communities (134 total, 11 thin omitted)

### Community 0 - "article.service.ts"
Cohesion: 0.14
Nodes (14): ArticleOutDto, TopicOutDto, ArticleModel, articleDetailOut(), articleOut(), ArticleService, computeSyncStatus(), toArticleOutDto() (+6 more)

### Community 1 - "index.ts"
Cohesion: 0.08
Nodes (25): connectDatabase(), bootstrap(), createApp(), migrateNestedApiKeySettings(), router, inviteController, router, authController (+17 more)

### Community 2 - "user.service.ts"
Cohesion: 0.14
Nodes (27): normalizeAgentToolNameKey(), auditFailTool(), auditOkTool(), auditToolArgs(), generateResponse(), leadFieldArgs(), mergeSapAiToolArgs(), statusLabelForTool() (+19 more)

### Community 3 - "auth.service.ts"
Cohesion: 0.16
Nodes (14): LoginInDto, LoginOutDto, registerInDto, RegisterOutDto, ResetPasswordInDto, ResetPasswordOutDto, SendOtpInDto, CreateVisitorJwtInDto (+6 more)

### Community 4 - "admin.controller.ts"
Cohesion: 0.15
Nodes (24): ApplyLeadAgentActionDto, LeadAgentActionResultDto, LeadCaptureSettingsOutDto, LeadExportOutDto, LeadMessageOutDto, LeadOutDto, UpdateLeadCaptureSettingsDto, LeadAsk (+16 more)

### Community 5 - "devDependencies"
Cohesion: 0.07
Nodes (27): devDependencies, @tsconfig/node22, tsx, @types/bcrypt, @types/cors, @types/express, @types/jsonwebtoken, @types/multer (+19 more)

### Community 6 - "apiKey.service.ts"
Cohesion: 0.22
Nodes (16): ApiKeyOutDto, CreateApiKeyDto, CreateApiKeyOutDto, UpdateApiKeyDto, ApiKeyModel, ApiKeyDoc, ApiKeyService, cascadeDeleteForApiKey() (+8 more)

### Community 7 - "article.controller.ts"
Cohesion: 0.16
Nodes (7): ArticleController, multerFiles(), MeetingToolController, parseApiKeyIdQuery(), parseArticleRouteId(), parseParam(), parseTopicRouteId()

### Community 8 - "AppConfig.service.ts"
Cohesion: 0.06
Nodes (53): CreateVisitorLiveAgentTicketDto, ListAgentTicketsQuery, LiveAgentTicketAiContextTurnDto, LiveAgentTicketDetailOutDto, LiveAgentTicketMessageOutDto, LiveAgentTicketOutDto, LiveAgentTicketRatingDto, PostLiveAgentTicketMessageDto (+45 more)

### Community 9 - "entitlement.service.ts"
Cohesion: 0.08
Nodes (42): formatGuidances(), extFromFilename(), imageMarkdownRef(), ParsedMarkdownArticle, ParsedMarkdownTopic, parseTopicBody(), serializeArticleMarkdown(), serializeTopicContent() (+34 more)

### Community 10 - "jobValidation.ts"
Cohesion: 0.08
Nodes (45): deleteWidgetFileIfExists(), findOwnedWidgetFile(), uploadWidgetFile(), CreateNewsDto, NewsCtaDto, NewsMediaOutDto, NewsOutDto, PublicNewsDetailOutDto (+37 more)

### Community 11 - "job.dto.ts"
Cohesion: 0.07
Nodes (38): SubmitWidgetAiFeedbackDto, WidgetAiFeedbackOutDto, WidgetAnalyticsSummaryOutDto, WidgetCsatCommentDto, WidgetCsatSummaryDto, WidgetUsageNamedCountDto, WidgetVisitOutDto, WIDGET_AI_FEEDBACK_TRIGGERS (+30 more)

### Community 12 - "dependencies"
Cohesion: 0.08
Nodes (25): cors, express, jsonwebtoken, md-to-whatsapp, @modelcontextprotocol/client, mongoose, nodemailer, dependencies (+17 more)

### Community 13 - "JobWorkerService"
Cohesion: 0.11
Nodes (12): EmissionState, MemoryToolGuardStore, MemoryToolGuardStoreOptions, SessionEmissions, now(), store(), ToolGuardService, TOOL_GUARD_INTENT_RULES (+4 more)

### Community 14 - "modelRegistry.ts"
Cohesion: 0.10
Nodes (22): applyBonsaiToolDeltas(), BONSAI_BASE_URL, BonsaiChunk, BonsaiMessage, BonsaiToolCallDelta, bonsaiToolCalls(), DEFAULTS, OllamaChatOptions (+14 more)

### Community 15 - "jobWorkerService.ts"
Cohesion: 0.12
Nodes (24): BookMeetingConflictDto, BookMeetingSuccessDto, MeetingFieldValueDto, MeetingAvailabilityDto, MeetingAvailabilityWindowDto, MeetingBookingFieldDto, MeetingFieldConfigDto, MeetingSlotDto (+16 more)

### Community 16 - "jsonOutputGuard.ts"
Cohesion: 0.07
Nodes (16): CreateGuidanceDto, GuidanceAgentItemDto, GuidanceOutDto, UpdateGuidanceDto, GuidanceInterface, GuidanceModel, guidanceSchema, EntitlementService (+8 more)

### Community 17 - "tsconfig.json"
Cohesion: 0.18
Nodes (10): dist, **/*.ts, @tsconfig/node22/tsconfig.json, compilerOptions, forceConsistentCasingInFileNames, outDir, rootDir, exclude (+2 more)

### Community 18 - "ollamaClient.ts"
Cohesion: 0.17
Nodes (12): PublicWidgetOutDto, UpdateWidgetDto, WidgetOutDto, VisitorJwtAlgorithm, WidgetAccessMode, isPlainObject(), sanitizeClaims(), SignedVisitorJwt (+4 more)

### Community 19 - "JobService"
Cohesion: 0.05
Nodes (65): BatchTestGroupDetailOutDto, BatchTestGroupOutDto, BatchTestGroupProgressDto, BatchTestGroupProgressOutDto, BatchTestGroupSummaryDto, BatchTestQuestionExecutionDto, BatchTestQuestionOutDto, BulkBatchTestQuestionIdsDto (+57 more)

### Community 20 - "OllamaClient"
Cohesion: 0.19
Nodes (15): deleteArticleFileIfUnused(), CreateSnippetDto, SnippetOutDto, UpdateSnippetDto, ChunkModel, TopicModel, snippetOut(), SnippetService (+7 more)

### Community 21 - "widget.model.ts"
Cohesion: 0.22
Nodes (8): AgentInfluenceArticleDto, AgentInfluenceChunkDto, AgentInfluenceDeclaredToolDto, AgentInfluenceDto, AgentInfluenceGuidanceDto, AgentInfluenceToolDto, AgentInfluenceTopicDto, AgentToolUiEvent

### Community 22 - "PUBLIC_CAPABILITIES"
Cohesion: 0.24
Nodes (13): CreateUiTemplateDto, GenerateUiTemplateFromToolDto, GenerateUiTemplateFromToolOutDto, UpdateUiTemplateDto, llmConfigForUiGenerate(), parseUiTemplateDefinition(), parseCreateUiTemplateDto(), parseDefinition() (+5 more)

### Community 23 - "deepseekClient.ts"
Cohesion: 0.12
Nodes (19): findArticleFile(), findOwnedArticleFile(), openArticleDownload(), uploadArticleFile(), ExportArticleOutDto, ArticleInterface, articleSchema, ArticleDoc (+11 more)

### Community 24 - "WidgetService"
Cohesion: 0.14
Nodes (10): findLiveAgentFile(), deleteAllWidgetFilesForApiKey(), openWidgetDownload(), PublicArticleDetailOutDto, PublicChatMessagesOutDto, PublicFaqContentOutDto, Widget, assertOwnedApiKey() (+2 more)

### Community 25 - "articleBucket.ts"
Cohesion: 0.29
Nodes (6): requireLiveAgent, canLiveAgent, imageUpload, liveAgentController, router, ticketController

### Community 26 - "widget.service.ts"
Cohesion: 0.31
Nodes (12): chatOnce(), coerceUiDescRoot(), coerceUiDescStrings(), extractJsonObject(), generateToolUiFromResult(), generateUiTemplateFromOutputSchema(), GenerateUiTemplateFromSchemaResult, truncateJson() (+4 more)

### Community 27 - "widget.controller.ts"
Cohesion: 0.17
Nodes (8): multerFile(), parseArticleIdParam(), parseMediaIdParam(), parsePublicKeyParam(), parseSessionIdParam(), WidgetController, parseBindVisitorIdentityDto(), parseCreatePublicChatSessionDto()

### Community 28 - "message.interface.ts"
Cohesion: 0.10
Nodes (27): ChatAnalyticsInterface, chatAnalyticsSchema, MESSAGE_CONTENT_BLOCK_TYPES, MESSAGE_ROLES, MessageArticleBlock, MessageChunkBlock, MessageContentBlock, MessageContentBlockType (+19 more)

### Community 29 - "agent.graph.ts"
Cohesion: 0.10
Nodes (37): chatTurnWithQuota(), chatWithQuota(), toObjectId(), AgentPipelineEvent, completeChat(), decideRetrieval(), expandRetrievalQueries(), extractJsonObject() (+29 more)

### Community 30 - "widgetValidation.ts"
Cohesion: 0.06
Nodes (63): ArticleFileResult, computePhash(), deleteAllArticleFilesForApiKey(), deleteArticleFile(), deleteArticleFileIfExists(), findSimilarArticleFile(), getArticleBucket(), UploadArticleFileOpts (+55 more)

### Community 31 - "agent.service.ts"
Cohesion: 0.13
Nodes (32): AgentTurnEvent, AgentMemoryModel, ChatSessionModel, ChatMessageModel, deleteMemoriesForSession(), meetingBookingMarkerRe(), stripModelLeakTags(), AgentService (+24 more)

### Community 32 - "mcp.interface.ts"
Cohesion: 0.08
Nodes (55): CreateMcpDto, McpAuthenticationPublic, McpAuthPublicConfig, McpOutDto, McpSyncResultDto, McpToolOutDto, UpdateMcpDto, UpdateMcpToolDto (+47 more)

### Community 33 - "plan.service.ts"
Cohesion: 0.40
Nodes (4): requireAdmin(), adminController, router, upload

### Community 34 - "AppConfigService"
Cohesion: 0.43
Nodes (6): formatRetrievedContext(), formatHandleRef(), fromLlmImageHandles(), parseLooseAttrs(), toLlmImageHandles(), formatImageRef()

### Community 35 - "AuthController"
Cohesion: 0.07
Nodes (43): AddPlanPeriodsResultOutDto, PlanPeriodsPreviewOutDto, UserPlanPeriodOutDto, UserPlanTimelineOutDto, UserPlanPeriodModel, LegacyUser, migrateUserPlanPeriods(), assertValidRange() (+35 more)

### Community 36 - "job.dto.ts"
Cohesion: 0.32
Nodes (3): buildTranslatePrompt(), OllamaClient, toOllamaMessages()

### Community 37 - "mail.service.ts"
Cohesion: 0.39
Nodes (9): bodyText(), ctaButton(), escapeHtml(), fieldLabel(), fieldValue(), infoPanel(), layout(), MailService (+1 more)

### Community 38 - "createLlmProvider.ts"
Cohesion: 0.24
Nodes (5): EnabledMeetingTopicForAgent, MeetingBookingPayloadDto, MeetingTopicListOutDto, MeetingTopicModel, MeetingToolService

### Community 39 - "logger.ts"
Cohesion: 0.13
Nodes (20): LeadModel, valuesToMap(), LeadCaptureService, textFromMessage(), toLeadOut(), toSettingsOut(), backfillPendingSummaries(), backoffMs() (+12 more)

### Community 40 - "AdminService"
Cohesion: 0.13
Nodes (19): ChatMessageInterface, chatMessageSchema, messageAnalysisGapSchema, messageAnalysisSchema, messageContentBlockSchema, messageContextSchema, ChatMessageAnalysis, AnalyticsDoc (+11 more)

### Community 41 - ".chunkArticle"
Cohesion: 0.09
Nodes (25): ChunkInterface, chunkSchema, TOPIC_SYNC_VALUES, TOPIC_TYPE_VALUES, TopicInterface, TopicSyncStatus, TopicType, topicSchema (+17 more)

### Community 42 - "topicValidation.ts"
Cohesion: 0.08
Nodes (28): DashboardOverviewOutDto, DashboardOverviewProjectOutDto, DashboardOverviewTotalsOutDto, DeepseekUsageOutDto, UserPlanNextPeriodOutDto, UserPlanOutDto, UserPlanStatusOutDto, logger (+20 more)

### Community 43 - "UserModel"
Cohesion: 0.31
Nodes (8): LlmChatConfig, LlmChatMessage, LlmChatRole, LlmChatTurnResult, LlmProviderName, LlmToolDefinition, textFromMessage(), toLlmHistory()

### Community 44 - "agent.memory.ts"
Cohesion: 0.29
Nodes (7): AgentMemoryInterface, agentMemorySchema, applyMemoryUpdates(), MemoryDoc, MemoryEntry, MemoryUpdates, normalizeKey()

### Community 45 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, format, format:check, lint, lint:fix, start (+2 more)

### Community 46 - "OllamaClient"
Cohesion: 0.24
Nodes (3): BatchTestController, parseBatchTestGroupId(), parseBatchTestQuestionId()

### Community 47 - "package.json"
Cohesion: 0.25
Nodes (7): author, description, keywords, license, name, type, version

### Community 48 - "topic.model.ts"
Cohesion: 0.08
Nodes (31): PublicArticleTopicOutDto, BindVisitorIdentityDto, ChatSessionVisitorOutDto, CreatePublicChatSessionDto, HomeSectionElementDto, PublicChatMessageOutDto, PublicFaqArticleOutDto, PublicFaqTopicOutDto (+23 more)

### Community 49 - "@langchain/langgraph"
Cohesion: 0.14
Nodes (21): AcceptApiKeyCollaborationInviteOutDto, CollaborationInviteAcceptRole, CreateApiKeyCollaborationInviteOutDto, ApiKeyCollaborationInviteInterface, ApiKeyCollaborationInviteModel, apiKeyCollaborationInviteSchema, defaultCollaboratorPermissions(), ApiKeyCollaborationInviteService (+13 more)

### Community 50 - "sharp-phash"
Cohesion: 0.16
Nodes (16): BookMeetingDto, BookMeetingResultDto, MeetingOutDto, SessionMeetingFactDto, MeetingModel, mailer, isDuplicateKeyError(), MeetingDoc (+8 more)

### Community 51 - "zod"
Cohesion: 0.06
Nodes (21): AddPlanPeriodsDto, AdjustPeriodTokensDto, CurrentPeriodQuotaOutDto, DeepseekTokenAdjustmentOutDto, DeepseekTokenAdjustmentSourceDto, PlanPeriodEffectiveModeDto, PlanPeriodGapOutDto, PlanPeriodInputDto (+13 more)

### Community 52 - "chatAnalytics.service.ts"
Cohesion: 0.17
Nodes (5): getApiKeyScope(), ChatAnalyticsController, parseAnalyticsRouteId(), parseCategoryRouteId(), parseLiveAgentRouteId()

### Community 53 - "mongoose"
Cohesion: 0.16
Nodes (21): CHAT_ANALYTICS_JOB_STATUS_VALUES, ChatAnalyticsJobInterface, ChatAnalyticsJobStatus, ChatAnalyticsJobToolOutcome, ChatAnalyticsJobModel, chatAnalyticsJobSchema, chatAnalyticsJobToolSchema, AGENT_EXECUTION_MODES (+13 more)

### Community 54 - "requireApiKeyAccess.ts"
Cohesion: 0.07
Nodes (44): ApiKeyAccess, ApiKeyAccessRole, ApiKeyIdResolver, ApiKeySummary, attachApiKeyAccess(), hasApiKeyPermission(), json(), loadApiKeyAccess() (+36 more)

### Community 55 - "bcrypt"
Cohesion: 0.16
Nodes (15): MCP_TOOL_RENDER_VALUES, McpToolInterface, McpToolRender, mcpToolSchema, UiTemplateInterface, uiTemplateSchema, McpToolDoc, ToolUiBuildResult (+7 more)

### Community 56 - "chatAnalytics.controller.ts"
Cohesion: 0.15
Nodes (22): AnalyticsCategoryOutDto, ChatAnalyticsConversationMessageOutDto, ChatAnalyticsConversationOutDto, ChatAnalyticsRecordsPageOutDto, ChatAnalyticsTrendSeriesOutDto, ChatAnalyticsTrendsOutDto, CreateAnalyticsCategoryDto, UpdateAnalyticsCategoryDto (+14 more)

### Community 57 - "ChatAnalyticsService"
Cohesion: 0.22
Nodes (6): ChatAnalyticsRecordOutDto, AnalyticsCategoryModel, ChatAnalyticsModel, ChatAnalyticsService, textFromMessage(), toRecordOutDto()

### Community 58 - "agent.state.ts"
Cohesion: 0.17
Nodes (13): CreatePlanDto, PlanOutDto, UpdatePlanDto, PlanDoc, PlanService, toPlanOutDto(), parseAccentColor(), parseBoolean() (+5 more)

### Community 59 - "meetingTool.ts"
Cohesion: 0.23
Nodes (18): MEETING_FIELD_TYPE_VALUES, defaultLabelForType(), isBreakInsideWindows(), isValidIanaTimezone(), parseAvailabilityWindow(), parseBlackoutDate(), parseBoolean(), parseFieldConfig() (+10 more)

### Community 60 - "apiKeyCollaborator.service.ts"
Cohesion: 0.29
Nodes (10): ApiKeyCollaboratorOutDto, CreateApiKeyCollaboratorDto, UpdateApiKeyCollaboratorDto, CollaboratorPermissions, ApiKeyCollaboratorModel, ApiKeyCollaboratorDoc, ApiKeyCollaboratorService, findDoc() (+2 more)

### Community 61 - "apiKeyCollaborator.controller.ts"
Cohesion: 0.21
Nodes (8): ApiResponseDto, ApiKeyCollaborationInviteController, ApiKeyCollaboratorController, parseCollaborationInviteToken(), parseBoolean(), parseCollaboratorPermissions(), parseCollaboratorUserId(), requireUserId()

### Community 62 - "user.service.ts"
Cohesion: 0.11
Nodes (16): isPredictResponse(), LayaAction, LayaAnswer, LayaChoiceAnswer, LayaChoiceQuestion, LayaClient, LayaClientConfig, LayaNoulAnswer (+8 more)

### Community 63 - "parseApiKeyId"
Cohesion: 0.14
Nodes (18): DeepseekChatRequest, DeepseekChatRole, DeepseekChunk, DeepseekClientConfig, DeepseekDelta, DeepseekMessage, DeepseekTool, DeepseekToolCall (+10 more)

### Community 64 - "buildLlmMessages"
Cohesion: 0.20
Nodes (15): buildLlmMessages(), imageHandleSources(), prepareMessages(), clockContextPrompt(), conversationResolvedPrompt(), imageHandlesPrompt(), liveAgentOfferPrompt(), liveAgentOnRequestPrompt() (+7 more)

### Community 65 - "plan.service.ts"
Cohesion: 0.15
Nodes (21): CreateMeetingTopicDto, MeetingTopicOutDto, UpdateMeetingTopicDto, meetingTopicToolName(), migrateWeeklyHoursToSchedule(), resolveWeeklySchedule(), addDaysYmd(), CandidateSlot (+13 more)

### Community 66 - "apiKeyCollaborator.interface.ts"
Cohesion: 0.10
Nodes (16): AccessMod, ApiKeyModelType, CollaboratorServiceMod, fakeRes(), run(), API_KEY_PERMISSION_VALUES, ApiKeyCollaboratorInterface, ApiKeyPermission (+8 more)

### Community 67 - "MeetingToolService"
Cohesion: 0.10
Nodes (12): RateLimitCounterInterface, RateLimitCounterModel, rateLimitCounterSchema, Entry, MemoryStore, MemoryStoreOptions, CounterLean, isDuplicateKeyError() (+4 more)

### Community 68 - "guidance.controller.ts"
Cohesion: 0.20
Nodes (9): InvoiceOutDto, InvoiceStartModeDto, InvoiceTypeDto, InvoiceModel, buildInvoicePaymentPageUrl(), invoiceItemLabel(), InvoiceService, planNameById() (+1 more)

### Community 69 - "socket.ts"
Cohesion: 0.09
Nodes (22): bindStr, CHART_VARIANTS, runtimeMediaSchema, RuntimeNode, STATUS_VALUES, templateButtonGroupSchema, templateChartSchema, templateChartSeriesItemSchema (+14 more)

### Community 70 - "ChatAnalyticsDailyModel"
Cohesion: 0.26
Nodes (6): ChatAnalyticsSummaryOutDto, ChatAnalyticsDailyInterface, ChatAnalyticsDailyModel, chatAnalyticsDailySchema, mapToRecord(), utcDayStart()

### Community 71 - "topic.ts"
Cohesion: 0.19
Nodes (16): CreateTopicDto, ReorderTopicsDto, UpdateTopicDto, parseBooleanField(), parseContent(), parseCreateSnippetDto(), parseForceQuery(), parseUpdateSnippetDto() (+8 more)

### Community 72 - "rerankerClient.ts"
Cohesion: 0.22
Nodes (12): format(), location(), syncApiKeysToPlanLimit(), getPlanPeriodSyncStatus(), PlanPeriodSyncResult, PlanPeriodSyncStatus, processTick(), resyncMismatchedKeys() (+4 more)

### Community 73 - "OllamaClient"
Cohesion: 0.12
Nodes (24): ApiKeyInterface, ApiKeyStatusInterface, apiKeySchema, leadCaptureSettingSchema, leadFieldConfigSchema, liveAgentSettingSchema, whatsAppSettingSchema, leadFieldValueSchema (+16 more)

### Community 74 - "McpController"
Cohesion: 0.14
Nodes (6): LeadCaptureController, parseLeadId(), LiveAgentController, UiTemplateController, statusForMessage(), parseUiTemplateRouteId()

### Community 75 - "UserModel"
Cohesion: 0.10
Nodes (29): recordTokens(), addDeepseekTokens(), DeepseekQuotaSnapshot, DeepseekTokenDelta, loadQuotaContext(), resolveDeepseekQuota(), shouldUseDeepseek(), truncNonNeg() (+21 more)

### Community 76 - "meetingTool.model.ts"
Cohesion: 0.22
Nodes (7): MeetingTopicInterface, meetingAvailabilityWindowSchema, meetingFieldSchema, meetingTimeRangeSchema, meetingTopicSchema, weeklyDayScheduleSchema, weeklyHourSchema

### Community 77 - "meetingTool.controller.ts"
Cohesion: 0.14
Nodes (23): assertLoginEmailNotLocked(), keyFor(), recordLoginEmailFailure(), resetLoginEmailFailures(), retryAfterSeconds(), GLOBAL_RATE_LIMIT_SKIP_PATHS, rateLimitConfig, buildTestApp() (+15 more)

### Community 78 - ".sendOtp"
Cohesion: 0.21
Nodes (4): AppConfigInterface, AppConfigModel, appConfigSchema, AppConfigService

### Community 79 - "chatSession.model.ts"
Cohesion: 0.14
Nodes (13): CreateAdminInvoiceDto, CreateInvoiceDto, InvoiceListOutDto, InvoiceSimulatedPeriodOutDto, MarkInvoicePaidDto, MidtransClientConfigOutDto, PendingInvoiceConflictData, MidtransController (+5 more)

### Community 80 - "GuidanceController"
Cohesion: 0.12
Nodes (17): WhatsAppSetting, FlowNode, WhatsAppFlowNodeModel, wahaClient, chatTails, directChat(), enqueueChat(), loadFlowNodes() (+9 more)

### Community 81 - "widget.route.ts"
Cohesion: 0.23
Nodes (10): LiveAgentResilience, LiveAgentSetting, CALL_LIVE_AGENT_INPUT_SCHEMA, isFrustrationLevel(), LiveAgentFrustrationLevel, LiveAgentHandoffArgs, parseLiveAgentHandoffArgs(), shouldAllowLiveAgentHandoff() (+2 more)

### Community 82 - "fetchRemoteImage.ts"
Cohesion: 0.15
Nodes (8): getMidtransUrls(), MidtransBuild, MidtransUrls, CreateSnapTransactionInput, CreateSnapTransactionResult, FetchLike, GetTransactionStatusOutcome, MidtransService

### Community 83 - "apiKey.ts"
Cohesion: 0.22
Nodes (8): UpdateWhatsAppSettingsDto, WhatsAppQrOutDto, WhatsAppSettingsOutDto, WahaSessionStatus, WahaSession, waitPastStarting(), webhookUrlFor(), WhatsAppService

### Community 84 - "message.model.ts"
Cohesion: 0.42
Nodes (6): AgentController, isResponseGone(), parsePublicKeyParam(), parseTestChatBody(), SseEvent, writeSse()

### Community 85 - "article.route.ts"
Cohesion: 0.29
Nodes (6): articleController, canTrainArticles, imageUpload, importUpload, requireTrain, router

### Community 86 - "apiKey.route.ts"
Cohesion: 0.15
Nodes (10): apiKeyId, ApiKeyModelType, EntitlementMod, fields, LeadModelType, otherProjectId, ServiceMod, sessionId (+2 more)

### Community 87 - "apiKeyCollaborator.service.test.ts"
Cohesion: 0.08
Nodes (17): AdminDeepseekWindowDto, AdminUserArticleDto, AdminUserBatchDto, AdminUserDetailOutDto, AdminUserListOutDto, AdminUserOutDto, AdminUserProjectDto, AdminUserSharedProjectDto (+9 more)

### Community 88 - "WidgetService"
Cohesion: 0.12
Nodes (29): ChatSessionOutDto, ChatSessionVisitor, alignExpiredAtWithVisitor(), ArticleDoc, chatOrDefault(), ChatSessionDoc, defaultSessionExpiredAt(), faqOrDefault() (+21 more)

### Community 89 - "AppConfig.route.ts"
Cohesion: 0.40
Nodes (3): AppConfigController, appConfigController, router

### Community 90 - "guidance.service.test.ts"
Cohesion: 0.50
Nodes (3): GuidanceModelType, GuidanceServiceMod, UserServiceMod

### Community 91 - "batchTest.route.ts"
Cohesion: 0.67
Nodes (6): assertPublicResolvedHost(), fetchRemoteImageBuffer(), isBlockedHostname(), isPrivateIpv4(), isPrivateIpv6(), parseImageUrl()

### Community 92 - "widget.ts"
Cohesion: 0.22
Nodes (23): HOME_SECTION_TYPE_VALUES, VISITOR_JWT_ALGORITHM_VALUES, WIDGET_ACCESS_MODE_VALUES, homeOrDefault(), coerceHomeSettings(), defaultHomeSettings(), migrateGreeting(), parseAccessMode() (+15 more)

### Community 94 - "@modelcontextprotocol/client"
Cohesion: 0.22
Nodes (10): env, optionalNonNegativeInt(), optionalPositiveInt(), required(), stripQuotes(), parseBuild(), stripQuotes(), AccessTokenPayload (+2 more)

### Community 96 - "applyUiFieldMap.ts"
Cohesion: 0.30
Nodes (14): AnyNode, applyChildren(), applyNode(), applyUiFieldMap(), cellFromObject(), coerceChartSeries(), coerceStatus(), coerceString() (+6 more)

### Community 97 - "leadCapture.policy.ts"
Cohesion: 0.32
Nodes (10): acceptValue(), askForStrategy(), askInstruction(), decideLeadWrite(), isQualification(), LeadWriteDecision, missingRequiredKeys(), sanitizeIncomingFields() (+2 more)

### Community 98 - "migrateNestedSettings.ts"
Cohesion: 0.27
Nodes (9): FIELD_TYPES, FLAT_LIVE_AGENT_FIELDS, FlatApiKey, isLeadField(), LegacyLeadSettings, RESILIENCE, resilienceOf(), STRATEGIES (+1 more)

### Community 99 - "article.ts"
Cohesion: 0.15
Nodes (18): FlowField, FlowLeafNode, FlowLeafType, FlowMenuNode, FlowNodeBase, FlowOption, WhatsAppFlowNodeInterface, flowFieldSchema (+10 more)

### Community 101 - "widget.model.ts"
Cohesion: 0.25
Nodes (7): WidgetInterface, widgetChatSettingsSchema, widgetFaqEntrySchema, widgetFaqSettingsSchema, widgetHomeSettingsSchema, widgetSchema, widgetSectionSettingsSchema

### Community 102 - "chatSession.model.ts"
Cohesion: 0.40
Nodes (4): ChatSessionInterface, ChatSessionVisitorAuthMode, chatSessionSchema, chatSessionVisitorSchema

### Community 103 - "parseUpdateApiKeyDto"
Cohesion: 0.11
Nodes (19): authenticateByToken(), authenticateLiveAgent(), AuthError, ApiKeyAuthContext, authenticateByApiKey(), requireApiKey, readBearer(), requireAuth() (+11 more)

### Community 105 - "jsonSchemaPaths.ts"
Cohesion: 0.73
Nodes (5): asRecord(), flattenJsonSchemaPaths(), isArraySchema(), objectSchemaWithProperties(), schemaBranches()

### Community 107 - "sharp"
Cohesion: 0.33
Nodes (6): parseMeetingTopicIdQuery(), parsePublicKey(), parseSessionIdQuery(), parseAvailabilityRangeQuery(), parseBookMeetingDto(), parseCreateMeetingTopicDto()

### Community 108 - "DeepseekClient"
Cohesion: 0.18
Nodes (10): AnalyticsCategoryInterface, AnalyticsOptionSeed, PROJECT_ANALYTICS_ANSWERABLE_SEEDS, PROJECT_ANALYTICS_CATEGORY_SEEDS, PROJECT_ANALYTICS_GAP_SEEDS, PROJECT_ANALYTICS_INTENT_SEEDS, PROJECT_ANALYTICS_OPTION_SEEDS, PROJECT_ANALYTICS_TYPE_SEEDS (+2 more)

### Community 109 - "user.route.ts"
Cohesion: 0.25
Nodes (3): UserController, router, userController

### Community 110 - "liveAgentFrustration.ts"
Cohesion: 0.19
Nodes (14): jszip, jszip, ArticleDetailOutDto, ArticleSyncStatus, CreateArticleDto, ImportArticleDto, UpdateArticleDto, parseArticleMarkdown() (+6 more)

### Community 111 - "widget.route.ts"
Cohesion: 0.27
Nodes (18): asSession(), createSession(), CreateWahaSessionInput, getQrPng(), getSession(), logoutSession(), readError(), restartSession() (+10 more)

### Community 112 - "apiKey.route.ts"
Cohesion: 0.13
Nodes (11): startingPoll, apiKeyId, deliverMessage(), flowDocs, mockRes(), original, originalPoll, userId (+3 more)

### Community 113 - "snippet.route.ts"
Cohesion: 0.16
Nodes (7): apiKeyIdFromParam(), resolveApiKeyIdFromRequest(), multerFile(), NewsController, parseApiKeyId(), parseImportArticleDto(), parseNewsId()

### Community 114 - "plan.route.ts"
Cohesion: 0.39
Nodes (5): AuthController, errorBody(), errorStatus(), normalizeEmail(), isHttpError()

### Community 115 - "verifyPublicSessionId"
Cohesion: 0.21
Nodes (14): defaultsForBuild(), loadPaymentPollConfig(), parseNonNegativeInt(), parsePositiveInt(), PaymentPollConfig, mapPool(), onSignal(), PendingLean (+6 more)

### Community 116 - "guidance.route.ts"
Cohesion: 0.21
Nodes (7): Otpinterface, OtpPurpose, OtpModel, otpSchema, OtpService, otpRateConfig, HttpError

### Community 117 - "LlmTokenUsage"
Cohesion: 0.31
Nodes (7): ChatTurnWithQuotaOptions, ChatTurnWithQuotaResult, ChatWithQuotaOptions, estimateTokensFromMessages(), usageFromTurn(), DeepseekTurnError, LlmTokenUsage

### Community 118 - "agent.route.ts"
Cohesion: 0.27
Nodes (7): notFound(), one(), scope(), secretEquals(), send(), WhatsAppController, WahaWebhookBody

### Community 119 - "meetingTool.route.ts"
Cohesion: 0.24
Nodes (3): McpController, parseMcpRouteId(), parseMcpToolRouteId()

### Community 120 - "express"
Cohesion: 0.47
Nodes (4): UiTemplateOutDto, UiTemplateModel, toOutDto(), UiTemplateService

### Community 122 - "@types/node"
Cohesion: 0.27
Nodes (6): isRerankResponse(), isRerankResult(), RerankerClient, RerankerClientConfig, RerankResponse, RerankResult

### Community 124 - ".updateSettings"
Cohesion: 0.51
Nodes (8): headerTokensMatchKey(), headerToKey(), keyToDisplayHeader(), leafPropertyKeysForArray(), normalizeTableHeadersInNode(), pickLeafKeyForHeader(), resolveRecordField(), tokenizeIdent()

### Community 125 - ".applyMidtransStatus"
Cohesion: 0.38
Nodes (3): InvoiceDoc, MidtransNotificationPayload, MidtransStatusResult

### Community 127 - "invoice.model.ts"
Cohesion: 0.14
Nodes (15): INVOICE_START_MODES, INVOICE_STATUSES, INVOICE_TYPES, InvoiceInterface, InvoiceStartMode, InvoiceStatus, InvoiceType, InvoiceSchema (+7 more)

## Knowledge Gaps
- **494 isolated node(s):** `name`, `version`, `description`, `dev`, `start` (+489 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `topicValidation.ts` to `index.ts`, `auth.service.ts`, `AppConfig.service.ts`, `job.dto.ts`, `modelRegistry.ts`, `JobService`, `widget.service.ts`, `agent.graph.ts`, `agent.service.ts`, `AuthController`, `mail.service.ts`, `logger.ts`, `AdminService`, `.chunkArticle`, `sharp-phash`, `mongoose`, `bcrypt`, `user.service.ts`, `parseApiKeyId`, `rerankerClient.ts`, `UserModel`, `meetingTool.controller.ts`, `chatSession.model.ts`, `GuidanceController`, `widget.route.ts`, `fetchRemoteImage.ts`, `migrateNestedSettings.ts`, `parseUpdateApiKeyDto`, `verifyPublicSessionId`, `guidance.route.ts`, `LlmTokenUsage`, `agent.route.ts`, `@types/node`, `invoice.model.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `statusForMessage()` connect `McpController` to `parseRouteId`, `admin.controller.ts`, `apiKey.service.ts`, `article.controller.ts`, `AppConfig.service.ts`, `jobValidation.ts`, `job.dto.ts`, `jsonOutputGuard.ts`, `JobService`, `PUBLIC_CAPABILITIES`, `widget.controller.ts`, `widgetValidation.ts`, `OllamaClient`, `chatAnalytics.service.ts`, `chatAnalytics.controller.ts`, `apiKeyCollaborator.controller.ts`, `topic.ts`, `chatSession.model.ts`, `message.model.ts`, `apiKeyCollaborationInvite.controller.ts`, `GuidanceController`, `sharp`, `liveAgentFrustration.ts`, `snippet.route.ts`, `agent.route.ts`, `meetingTool.route.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `ApiKeyModel` connect `apiKey.service.ts` to `admin.controller.ts`, `AppConfig.service.ts`, `jobValidation.ts`, `jsonOutputGuard.ts`, `WidgetService`, `agent.graph.ts`, `widgetValidation.ts`, `agent.service.ts`, `logger.ts`, `topicValidation.ts`, `@langchain/langgraph`, `requireApiKeyAccess.ts`, `apiKeyCollaborator.service.ts`, `plan.service.ts`, `rerankerClient.ts`, `OllamaClient`, `GuidanceController`, `apiKey.ts`, `WidgetService`, `migrateNestedSettings.ts`, `parseUpdateApiKeyDto`, `apiKey.route.ts`, `agent.route.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _494 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `article.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13911290322580644 - nodes in this community are weakly interconnected._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07954545454545454 - nodes in this community are weakly interconnected._
- **Should `user.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._