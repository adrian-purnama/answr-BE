# Graph Report - backend  (2026-10-04)

## Corpus Check
- 305 files · ~143,166 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2695 nodes · 7744 edges · 128 communities (120 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.52)
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

## God Nodes (most connected - your core abstractions)
1. `statusForMessage()` - 166 edges
2. `getApiKeyScope()` - 118 edges
3. `parseApiKeyIdQuery()` - 84 edges
4. `ApiKeyModel` - 54 edges
5. `parseApiKeyId()` - 54 edges
6. `EntitlementService` - 47 edges
7. `TopicModel` - 42 edges
8. `UserModel` - 40 edges
9. `logger` - 39 edges
10. `parseParam()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `resolveApiKeyIdFromRequest()` --calls--> `parseApiKeyId()`  [EXTRACTED]
  src/middleware/requireApiKeyAccess.ts → src/validation/apiKey.ts
- `apiKeyIdFromParam()` --calls--> `parseApiKeyId()`  [EXTRACTED]
  src/middleware/requireApiKeyAccess.ts → src/validation/apiKey.ts
- `parseImportArticleDto()` --calls--> `parseApiKeyId()`  [EXTRACTED]
  src/validation/article.ts → src/validation/apiKey.ts
- `uploadArticleFile()` --calls--> `uploadFile()`  [EXTRACTED]
  src/buckets/articleBucket.ts → src/buckets/gridfs.ts
- `deleteArticleFile()` --calls--> `deleteFile()`  [EXTRACTED]
  src/buckets/articleBucket.ts → src/buckets/gridfs.ts

## Import Cycles
- None detected.

## Communities (128 total, 8 thin omitted)

### Community 0 - "article.service.ts"
Cohesion: 0.20
Nodes (7): TopicOutDto, ArticleModel, ChunkModel, TopicModel, ArticleService, resolveTopicReferences(), deleteChunkPoints()

### Community 1 - "index.ts"
Cohesion: 0.11
Nodes (17): connectDatabase(), bootstrap(), createApp(), migrateNestedApiKeySettings(), inviteController, router, authController, router (+9 more)

### Community 2 - "user.service.ts"
Cohesion: 0.16
Nodes (24): normalizeAgentToolNameKey(), generateResponse(), leadFieldArgs(), makeAgentTurnChat(), mergeSapAiToolArgs(), statusLabelForTool(), toolResultContentWithUiHint(), toolUiShownPrompt() (+16 more)

### Community 3 - "auth.service.ts"
Cohesion: 0.11
Nodes (18): LoginInDto, LoginOutDto, registerInDto, RegisterOutDto, ResetPasswordInDto, ResetPasswordOutDto, SendOtpInDto, CreateVisitorJwtInDto (+10 more)

### Community 4 - "admin.controller.ts"
Cohesion: 0.15
Nodes (22): ApplyLeadAgentActionDto, LeadAgentActionResultDto, LeadExportOutDto, LeadMessageOutDto, LeadOutDto, LeadAsk, LeadFieldValue, LeadQualification (+14 more)

### Community 5 - "devDependencies"
Cohesion: 0.07
Nodes (27): mongodb-memory-server, devDependencies, mongodb-memory-server, @tsconfig/node22, tsx, @types/bcrypt, @types/cors, @types/express (+19 more)

### Community 6 - "apiKey.service.ts"
Cohesion: 0.30
Nodes (10): ApiKeyOutDto, CreateApiKeyDto, CreateApiKeyOutDto, UpdateApiKeyDto, ApiKeyModel, ApiKeyDoc, ApiKeyService, cascadeDeleteForApiKey() (+2 more)

### Community 7 - "article.controller.ts"
Cohesion: 0.16
Nodes (14): ArticleController, multerFiles(), parseApiKeyIdQuery(), parseArticleRouteId(), parseCreateArticleDto(), parseDescription(), parseForceQuery(), parseImportArticleDto() (+6 more)

### Community 8 - "AppConfig.service.ts"
Cohesion: 0.06
Nodes (53): CreateVisitorLiveAgentTicketDto, ListAgentTicketsQuery, LiveAgentTicketAiContextTurnDto, LiveAgentTicketDetailOutDto, LiveAgentTicketMessageOutDto, LiveAgentTicketOutDto, LiveAgentTicketRatingDto, PostLiveAgentTicketMessageDto (+45 more)

### Community 9 - "entitlement.service.ts"
Cohesion: 0.08
Nodes (39): extFromFilename(), imageMarkdownRef(), ParsedMarkdownArticle, ParsedMarkdownTopic, parseTopicBody(), serializeArticleMarkdown(), serializeTopicContent(), applyVarBindings() (+31 more)

### Community 10 - "jobValidation.ts"
Cohesion: 0.09
Nodes (45): deleteWidgetFileIfExists(), findOwnedWidgetFile(), uploadWidgetFile(), CreateNewsDto, NewsCtaDto, NewsMediaOutDto, NewsOutDto, PublicNewsDetailOutDto (+37 more)

### Community 11 - "job.dto.ts"
Cohesion: 0.07
Nodes (39): SubmitWidgetAiFeedbackDto, WidgetAiFeedbackOutDto, WidgetAnalyticsSummaryOutDto, WidgetCsatCommentDto, WidgetCsatSummaryDto, WidgetUsageNamedCountDto, WidgetVisitOutDto, WIDGET_AI_FEEDBACK_TRIGGERS (+31 more)

### Community 12 - "dependencies"
Cohesion: 0.08
Nodes (25): bcrypt, cors, jsonwebtoken, @modelcontextprotocol/client, mongoose, nodemailer, dependencies, bcrypt (+17 more)

### Community 13 - "JobWorkerService"
Cohesion: 0.11
Nodes (12): EmissionState, MemoryToolGuardStore, MemoryToolGuardStoreOptions, SessionEmissions, now(), store(), ToolGuardService, TOOL_GUARD_INTENT_RULES (+4 more)

### Community 14 - "modelRegistry.ts"
Cohesion: 0.09
Nodes (22): applyBonsaiToolDeltas(), BONSAI_BASE_URL, BonsaiChunk, BonsaiMessage, BonsaiToolCallDelta, bonsaiToolCalls(), DEFAULTS, OllamaChatOptions (+14 more)

### Community 15 - "jobWorkerService.ts"
Cohesion: 0.11
Nodes (25): BookMeetingConflictDto, BookMeetingSuccessDto, MeetingFieldValueDto, MeetingAvailabilityDto, MeetingAvailabilityWindowDto, MeetingBookingFieldDto, MeetingFieldConfigDto, MeetingSlotDto (+17 more)

### Community 16 - "jsonOutputGuard.ts"
Cohesion: 0.08
Nodes (12): CreateGuidanceDto, GuidanceAgentItemDto, GuidanceOutDto, UpdateGuidanceDto, GuidanceInterface, GuidanceModel, guidanceSchema, EntitlementService (+4 more)

### Community 17 - "tsconfig.json"
Cohesion: 0.18
Nodes (10): dist, **/*.ts, @tsconfig/node22/tsconfig.json, compilerOptions, forceConsistentCasingInFileNames, outDir, rootDir, exclude (+2 more)

### Community 18 - "ollamaClient.ts"
Cohesion: 0.36
Nodes (7): isPlainObject(), sanitizeClaims(), SignedVisitorJwt, signVisitorJwt(), SignVisitorJwtInput, VerifiedVisitorIdentity, verifyVisitorJwt()

### Community 19 - "JobService"
Cohesion: 0.07
Nodes (48): BatchTestGroupDetailOutDto, BatchTestGroupOutDto, BatchTestGroupProgressDto, BatchTestGroupProgressOutDto, BatchTestGroupSummaryDto, BatchTestQuestionExecutionDto, BatchTestQuestionOutDto, BulkBatchTestQuestionIdsDto (+40 more)

### Community 20 - "OllamaClient"
Cohesion: 0.24
Nodes (10): deleteArticleFileIfUnused(), CreateSnippetDto, SnippetOutDto, UpdateSnippetDto, snippetOut(), SnippetService, TopicDoc, toSnippetOutDto() (+2 more)

### Community 21 - "widget.model.ts"
Cohesion: 0.22
Nodes (8): AgentInfluenceArticleDto, AgentInfluenceChunkDto, AgentInfluenceDeclaredToolDto, AgentInfluenceDto, AgentInfluenceGuidanceDto, AgentInfluenceToolDto, AgentInfluenceTopicDto, AgentToolUiEvent

### Community 22 - "PUBLIC_CAPABILITIES"
Cohesion: 0.21
Nodes (10): UiTemplateController, parseUiTemplateDefinition(), parseCreateUiTemplateDto(), parseDefinition(), parseDescription(), parseGenerateUiTemplateFromToolDto(), parseName(), parseObjectIdField() (+2 more)

### Community 23 - "deepseekClient.ts"
Cohesion: 0.09
Nodes (31): jszip, jszip, ArticleDetailOutDto, ArticleOutDto, ArticleSyncStatus, CreateArticleDto, ExportArticleOutDto, ImportArticleDto (+23 more)

### Community 24 - "WidgetService"
Cohesion: 0.12
Nodes (14): openWidgetDownload(), PublicArticleDetailOutDto, PublicChatMessagesOutDto, PublicFaqContentOutDto, PublicWidgetOutDto, WidgetOutDto, WidgetAccessMode, Widget (+6 more)

### Community 25 - "articleBucket.ts"
Cohesion: 0.22
Nodes (9): authenticateLiveAgent(), readBearer(), requireAuth(), requireLiveAgent, canLiveAgent, imageUpload, liveAgentController, router (+1 more)

### Community 26 - "widget.service.ts"
Cohesion: 0.29
Nodes (13): chatWithQuota(), chatOnce(), coerceUiDescRoot(), coerceUiDescStrings(), extractJsonObject(), generateToolUiFromResult(), generateUiTemplateFromOutputSchema(), GenerateUiTemplateFromSchemaResult (+5 more)

### Community 27 - "widget.controller.ts"
Cohesion: 0.10
Nodes (12): LiveAgentController, NewsController, parsePublicKey(), parseMediaIdParam(), parsePublicKeyParam(), parseSessionIdParam(), WidgetController, parseApiKeyId() (+4 more)

### Community 28 - "message.interface.ts"
Cohesion: 0.10
Nodes (27): ChatAnalyticsInterface, chatAnalyticsSchema, MESSAGE_CONTENT_BLOCK_TYPES, MESSAGE_ROLES, MessageArticleBlock, MessageChunkBlock, MessageContentBlock, MessageContentBlockType (+19 more)

### Community 29 - "agent.graph.ts"
Cohesion: 0.13
Nodes (29): AgentPipelineEvent, auditFailTool(), auditOkTool(), auditToolArgs(), completeChat(), decideRetrieval(), expandRetrievalQueries(), extractJsonObject() (+21 more)

### Community 30 - "widgetValidation.ts"
Cohesion: 0.12
Nodes (34): ArticleFileResult, computePhash(), deleteAllArticleFilesForApiKey(), deleteArticleFile(), deleteArticleFileIfExists(), findArticleFile(), findSimilarArticleFile(), getArticleBucket() (+26 more)

### Community 31 - "agent.service.ts"
Cohesion: 0.16
Nodes (24): AgentTurnEvent, ChatMessageModel, deleteMemoriesForSession(), meetingBookingMarkerRe(), AgentService, assertOwnedSession(), assistantContent(), contextFromTurn() (+16 more)

### Community 32 - "mcp.interface.ts"
Cohesion: 0.08
Nodes (55): CreateMcpDto, McpAuthenticationPublic, McpAuthPublicConfig, McpOutDto, McpSyncResultDto, McpToolOutDto, UpdateMcpDto, UpdateMcpToolDto (+47 more)

### Community 33 - "plan.service.ts"
Cohesion: 0.40
Nodes (4): requireAdmin(), adminController, router, upload

### Community 34 - "AppConfigService"
Cohesion: 0.18
Nodes (12): MemoryEntry, AgentResolvedReferences, AgentResolvedToolCall, AgentResolvedTopicRef, AgentTurnState, AgentVisitorIdentity, RetrievedChunk, DeclaredAgentTool (+4 more)

### Community 35 - "AuthController"
Cohesion: 0.09
Nodes (30): AddPlanPeriodsDto, AddPlanPeriodsResultOutDto, PlanPeriodGapOutDto, PlanPeriodRemainderOutDto, PlanPeriodSourceDto, PlanPeriodsPreviewOutDto, UserPlanPeriodOutDto, assertValidRange() (+22 more)

### Community 36 - "job.dto.ts"
Cohesion: 0.32
Nodes (3): buildTranslatePrompt(), OllamaClient, toOllamaMessages()

### Community 37 - "mail.service.ts"
Cohesion: 0.39
Nodes (9): bodyText(), ctaButton(), escapeHtml(), fieldLabel(), fieldValue(), infoPanel(), layout(), MailService (+1 more)

### Community 38 - "createLlmProvider.ts"
Cohesion: 0.21
Nodes (6): EnabledMeetingTopicForAgent, MeetingBookingPayloadDto, MeetingTopicListOutDto, MeetingTopicInterface, MeetingTopicModel, MeetingToolService

### Community 39 - "logger.ts"
Cohesion: 0.17
Nodes (17): LeadModel, LeadCaptureService, textFromMessage(), backfillPendingSummaries(), backoffMs(), claimNext(), kickLeadSummaryWorker(), LeadJobDoc (+9 more)

### Community 40 - "AdminService"
Cohesion: 0.13
Nodes (19): ChatMessageInterface, chatMessageSchema, messageAnalysisGapSchema, messageAnalysisSchema, messageContentBlockSchema, messageContextSchema, ChatMessageAnalysis, AnalyticsDoc (+11 more)

### Community 41 - ".chunkArticle"
Cohesion: 0.09
Nodes (26): ChunkInterface, chunkSchema, TOPIC_SYNC_VALUES, TOPIC_TYPE_VALUES, TopicInterface, TopicSyncStatus, TopicType, topicSchema (+18 more)

### Community 42 - "topicValidation.ts"
Cohesion: 0.07
Nodes (30): AdminDeepseekWindowDto, AdminUserArticleDto, AdminUserBatchDto, AdminUserDetailOutDto, AdminUserListOutDto, AdminUserOutDto, AdminUserProjectDto, AdminUserSharedProjectDto (+22 more)

### Community 43 - "UserModel"
Cohesion: 0.19
Nodes (16): applyToolDeltas(), DeepseekProvider, parseToolArguments(), toDeepseekMessages(), toDeepseekTools(), toLlmToolCalls(), toUsage(), LlmChatConfig (+8 more)

### Community 44 - "agent.memory.ts"
Cohesion: 0.31
Nodes (8): AgentMemoryInterface, AgentMemoryModel, agentMemorySchema, applyMemoryUpdates(), listMemories(), MemoryDoc, MemoryUpdates, normalizeKey()

### Community 45 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, format, format:check, lint, lint:fix, start (+2 more)

### Community 46 - "OllamaClient"
Cohesion: 0.21
Nodes (10): BatchTestController, parseBatchTestGroupId(), parseBatchTestQuestionId(), parseBulkBatchTestQuestionIdsDto(), parseCreateBatchTestGroupDto(), parseCreateBatchTestQuestionDto(), parseNonEmptyString(), parseSetBatchTestRatingDto() (+2 more)

### Community 47 - "package.json"
Cohesion: 0.25
Nodes (7): author, description, keywords, license, name, type, version

### Community 48 - "topic.model.ts"
Cohesion: 0.12
Nodes (17): PublicArticleTopicOutDto, BindVisitorIdentityDto, ChatSessionVisitorOutDto, CreatePublicChatSessionDto, HomeSectionElementDto, PublicChatMessageOutDto, PublicFaqArticleOutDto, PublicFaqTopicOutDto (+9 more)

### Community 49 - "@langchain/langgraph"
Cohesion: 0.15
Nodes (20): AcceptApiKeyCollaborationInviteOutDto, CollaborationInviteAcceptRole, CreateApiKeyCollaborationInviteOutDto, ApiKeyCollaborationInviteInterface, ApiKeyCollaborationInviteModel, apiKeyCollaborationInviteSchema, ApiKeyCollaborationInviteService, ApiKeySummary (+12 more)

### Community 50 - "sharp-phash"
Cohesion: 0.17
Nodes (15): BookMeetingDto, BookMeetingResultDto, MeetingOutDto, SessionMeetingFactDto, MeetingModel, isDuplicateKeyError(), MeetingDoc, meetingEndsAt() (+7 more)

### Community 51 - "zod"
Cohesion: 0.09
Nodes (20): PlanPeriodInputDto, AdminController, AppConfigPayload, PlanPeriodConflictError, parseEmailSearchQuery(), parsePositiveInt(), parseUpdateAdminUserDto(), parseUserListQuery() (+12 more)

### Community 52 - "chatAnalytics.service.ts"
Cohesion: 0.11
Nodes (9): getApiKeyScope(), ChatAnalyticsController, McpController, MeetingToolController, parseAnalyticsRouteId(), parseCategoryRouteId(), parseMcpRouteId(), parseMcpToolRouteId() (+1 more)

### Community 53 - "mongoose"
Cohesion: 0.16
Nodes (21): CHAT_ANALYTICS_JOB_STATUS_VALUES, ChatAnalyticsJobInterface, ChatAnalyticsJobStatus, ChatAnalyticsJobToolOutcome, ChatAnalyticsJobModel, chatAnalyticsJobSchema, chatAnalyticsJobToolSchema, AGENT_EXECUTION_MODES (+13 more)

### Community 54 - "requireApiKeyAccess.ts"
Cohesion: 0.17
Nodes (20): ApiKeyAccess, ApiKeyAccessRole, apiKeyIdFromParam(), ApiKeyIdResolver, ApiKeySummary, attachApiKeyAccess(), hasApiKeyPermission(), json() (+12 more)

### Community 55 - "bcrypt"
Cohesion: 0.14
Nodes (17): CreateUiTemplateDto, GenerateUiTemplateFromToolDto, GenerateUiTemplateFromToolOutDto, UiTemplateOutDto, UpdateUiTemplateDto, MCP_TOOL_RENDER_VALUES, McpToolInterface, McpToolRender (+9 more)

### Community 56 - "chatAnalytics.controller.ts"
Cohesion: 0.15
Nodes (22): AnalyticsCategoryOutDto, ChatAnalyticsConversationMessageOutDto, ChatAnalyticsConversationOutDto, ChatAnalyticsRecordsPageOutDto, ChatAnalyticsTrendSeriesOutDto, ChatAnalyticsTrendsOutDto, CreateAnalyticsCategoryDto, UpdateAnalyticsCategoryDto (+14 more)

### Community 57 - "ChatAnalyticsService"
Cohesion: 0.22
Nodes (6): ChatAnalyticsRecordOutDto, AnalyticsCategoryModel, ChatAnalyticsModel, ChatAnalyticsService, textFromMessage(), toRecordOutDto()

### Community 58 - "agent.state.ts"
Cohesion: 0.16
Nodes (11): CreatePlanDto, PlanOutDto, UpdatePlanDto, PlanModel, UpdateAppConfigInput, ensureDefaultPlan(), seedPlan(), PlanDoc (+3 more)

### Community 59 - "meetingTool.ts"
Cohesion: 0.23
Nodes (18): MEETING_FIELD_TYPE_VALUES, defaultLabelForType(), isBreakInsideWindows(), isValidIanaTimezone(), parseAvailabilityWindow(), parseBlackoutDate(), parseBoolean(), parseFieldConfig() (+10 more)

### Community 60 - "apiKeyCollaborator.service.ts"
Cohesion: 0.29
Nodes (10): ApiKeyCollaboratorOutDto, CreateApiKeyCollaboratorDto, UpdateApiKeyCollaboratorDto, CollaboratorPermissions, ApiKeyCollaboratorModel, ApiKeyCollaboratorDoc, ApiKeyCollaboratorService, findDoc() (+2 more)

### Community 61 - "apiKeyCollaborator.controller.ts"
Cohesion: 0.15
Nodes (12): ApiKeyController, ApiKeyCollaboratorController, parseBoolean(), parseCreateApiKeyDto(), parseDescription(), parseIpAllowlist(), parseLabel(), parseRouteId() (+4 more)

### Community 62 - "user.service.ts"
Cohesion: 0.11
Nodes (16): isPredictResponse(), LayaAction, LayaAnswer, LayaChoiceAnswer, LayaChoiceQuestion, LayaClient, LayaClientConfig, LayaNoulAnswer (+8 more)

### Community 63 - "parseApiKeyId"
Cohesion: 0.14
Nodes (12): DeepseekChatRequest, DeepseekChatRole, DeepseekChunk, DeepseekClient, DeepseekClientConfig, DeepseekDelta, DeepseekMessage, DeepseekTool (+4 more)

### Community 64 - "buildLlmMessages"
Cohesion: 0.17
Nodes (18): buildLlmMessages(), formatGuidances(), formatRetrievedContext(), imageHandleSources(), prepareMessages(), clockContextPrompt(), conversationResolvedPrompt(), imageHandlesPrompt() (+10 more)

### Community 65 - "plan.service.ts"
Cohesion: 0.16
Nodes (20): CreateMeetingTopicDto, MeetingTopicOutDto, UpdateMeetingTopicDto, meetingTopicToolName(), resolveWeeklySchedule(), addDaysYmd(), CandidateSlot, DEFAULT_FIELDS (+12 more)

### Community 66 - "apiKeyCollaborator.interface.ts"
Cohesion: 0.11
Nodes (16): AccessMod, ApiKeyModelType, CollaboratorServiceMod, fakeRes(), run(), API_KEY_PERMISSION_VALUES, ApiKeyCollaboratorInterface, COLLABORATOR_PERMISSION_DEFAULTS (+8 more)

### Community 67 - "MeetingToolService"
Cohesion: 0.16
Nodes (23): findOwnedLiveAgentFile(), CreateLiveAgentDto, LiveAgentLoginDto, LiveAgentLoginOutDto, LiveAgentMediaOutDto, LiveAgentMeOutDto, ResetLiveAgentPasswordDto, UpdateLiveAgentDto (+15 more)

### Community 68 - "guidance.controller.ts"
Cohesion: 0.31
Nodes (7): InvoiceOutDto, InvoiceModel, InvoiceService, isPurchasablePrice(), purgeAtFromNow(), remainingExpiryMinutes(), toOutDtoBase()

### Community 69 - "socket.ts"
Cohesion: 0.07
Nodes (32): applyUiFieldMap(), buildDeterministicUi(), McpToolDoc, ToolUiBuildResult, tryBuildDeterministicToolUi(), tryBuildToolUi(), UiTemplateDoc, bindStr (+24 more)

### Community 70 - "ChatAnalyticsDailyModel"
Cohesion: 0.26
Nodes (6): ChatAnalyticsSummaryOutDto, ChatAnalyticsDailyInterface, ChatAnalyticsDailyModel, chatAnalyticsDailySchema, mapToRecord(), utcDayStart()

### Community 71 - "topic.ts"
Cohesion: 0.27
Nodes (11): CreateTopicDto, ReorderTopicsDto, UpdateTopicDto, coerceTopicContent(), legacyArrayToBlocks(), mediaIdsFromBlocks(), mediaIdsFromContent(), mediaIdToString() (+3 more)

### Community 72 - "rerankerClient.ts"
Cohesion: 0.09
Nodes (26): env, optionalPositiveInt(), required(), stripQuotes(), isRerankResponse(), isRerankResult(), RerankerClient, RerankerClientConfig (+18 more)

### Community 73 - "OllamaClient"
Cohesion: 0.20
Nodes (15): leadFieldValueSchema, leadSchema, LEAD_CAPTURE_STRATEGY_VALUES, LEAD_FIELD_TYPE_VALUES, LEAD_QUALIFICATION_VALUES, LEAD_STATUS_VALUES, LEAD_SUMMARY_JOB_STATUS_VALUES, LeadFieldType (+7 more)

### Community 75 - "UserModel"
Cohesion: 0.13
Nodes (22): addDeepseekTokens(), DeepseekQuotaSnapshot, DeepseekTokenDelta, loadQuotaContext(), resolveDeepseekQuota(), shouldUseDeepseek(), truncNonNeg(), canUseDeepseek() (+14 more)

### Community 76 - "meetingTool.model.ts"
Cohesion: 0.29
Nodes (6): meetingAvailabilityWindowSchema, meetingFieldSchema, meetingTimeRangeSchema, meetingTopicSchema, weeklyDayScheduleSchema, weeklyHourSchema

### Community 77 - "meetingTool.controller.ts"
Cohesion: 0.13
Nodes (17): logger, UserModel, userSchema, UserPlanPeriodModel, mailer, seedUser(), buildInvoicePaymentPageUrl(), InvoiceLean (+9 more)

### Community 78 - ".sendOtp"
Cohesion: 0.21
Nodes (4): AppConfigInterface, AppConfigModel, appConfigSchema, AppConfigService

### Community 79 - "chatSession.model.ts"
Cohesion: 0.17
Nodes (11): CreateInvoiceDto, InvoiceListOutDto, InvoiceSimulatedPeriodOutDto, MidtransClientConfigOutDto, ApiKeyCollaborationInviteController, MidtransController, requireUserId(), parseCreateInvoiceDto() (+3 more)

### Community 80 - "GuidanceController"
Cohesion: 0.43
Nodes (5): LeadCaptureSettingsOutDto, UpdateLeadCaptureSettingsDto, LeadCaptureStrategy, LeadFieldConfig, toSettingsOut()

### Community 81 - "widget.route.ts"
Cohesion: 0.21
Nodes (10): LiveAgentResilience, ApiKeyInterface, ApiKeyStatusInterface, LiveAgentSetting, apiKeySchema, leadCaptureSettingSchema, leadFieldConfigSchema, liveAgentSettingSchema (+2 more)

### Community 82 - "fetchRemoteImage.ts"
Cohesion: 0.16
Nodes (6): parseBuild(), stripQuotes(), getMidtransUrls(), MidtransBuild, MidtransUrls, MidtransService

### Community 83 - "apiKey.ts"
Cohesion: 0.27
Nodes (6): deleteLiveAgentFileIfExists(), LiveAgentOutDto, LiveAgentModel, LiveAgentDoc, LiveAgentService, toLiveAgentOutDto()

### Community 84 - "message.model.ts"
Cohesion: 0.28
Nodes (8): AgentController, isResponseGone(), parsePublicKeyParam(), parseTestChatBody(), SseEvent, writeSse(), clientIp(), stripMappedV4()

### Community 85 - "article.route.ts"
Cohesion: 0.29
Nodes (6): articleController, canTrainArticles, imageUpload, importUpload, requireTrain, router

### Community 86 - "apiKey.route.ts"
Cohesion: 0.15
Nodes (10): apiKeyId, ApiKeyModelType, EntitlementMod, fields, LeadModelType, otherProjectId, ServiceMod, sessionId (+2 more)

### Community 88 - "WidgetService"
Cohesion: 0.12
Nodes (31): ChatSessionOutDto, ChatSessionVisitor, ChatSessionModel, alignExpiredAtWithVisitor(), ArticleDoc, chatOrDefault(), ChatSessionDoc, defaultSessionExpiredAt() (+23 more)

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
Cohesion: 0.11
Nodes (37): UpdateWidgetDto, BUTTON_TEXT_ALIGN_VALUES, ButtonTextAlign, HOME_SECTION_TYPE_VALUES, HomeFaqElement, HomeFaqEntry, HomeGoToChatElement, HomeLatestNewsElement (+29 more)

### Community 94 - "@modelcontextprotocol/client"
Cohesion: 0.22
Nodes (10): authenticateByToken(), LiveAgentInterface, liveAgentSchema, UserInterface, Express, Request, AccessTokenPayload, LiveAgentTokenPayload (+2 more)

### Community 96 - "applyUiFieldMap.ts"
Cohesion: 0.35
Nodes (12): AnyNode, applyChildren(), applyNode(), cellFromObject(), coerceChartSeries(), coerceStatus(), coerceString(), coerceTableRows() (+4 more)

### Community 97 - "leadCapture.policy.ts"
Cohesion: 0.32
Nodes (10): acceptValue(), askForStrategy(), askInstruction(), decideLeadWrite(), isQualification(), LeadWriteDecision, missingRequiredKeys(), sanitizeIncomingFields() (+2 more)

### Community 98 - "migrateNestedSettings.ts"
Cohesion: 0.27
Nodes (9): FIELD_TYPES, FLAT_LIVE_AGENT_FIELDS, FlatApiKey, isLeadField(), LegacyLeadSettings, RESILIENCE, resilienceOf(), STRATEGIES (+1 more)

### Community 99 - "article.ts"
Cohesion: 0.50
Nodes (3): canMcp, mcpController, router

### Community 100 - "apiKeyCollaborationInvite.controller.ts"
Cohesion: 0.16
Nodes (10): ApiResponseDto, SnippetController, parseCollaborationInviteToken(), parseBooleanField(), parseContent(), parseCreateSnippetDto(), parseForceQuery(), parseSnippetRouteId() (+2 more)

### Community 101 - "widget.model.ts"
Cohesion: 0.25
Nodes (7): WidgetInterface, widgetChatSettingsSchema, widgetFaqEntrySchema, widgetFaqSettingsSchema, widgetHomeSettingsSchema, widgetSchema, widgetSectionSettingsSchema

### Community 102 - "chatSession.model.ts"
Cohesion: 0.40
Nodes (4): ChatSessionInterface, ChatSessionVisitorAuthMode, chatSessionSchema, chatSessionVisitorSchema

### Community 103 - "parseUpdateApiKeyDto"
Cohesion: 0.19
Nodes (9): AuthError, ApiKeyAuthContext, authenticateByApiKey(), requireApiKey, WIDGET_FEATURE_VALUES, WidgetFeature, WidgetFeatureGate, ApiKeyInactiveError (+1 more)

### Community 104 - "GuidanceController"
Cohesion: 0.31
Nodes (6): GuidanceController, parseContent(), parseCreateGuidanceDto(), parseGuidanceRouteId(), parseTitle(), parseUpdateGuidanceDto()

### Community 105 - "jsonSchemaPaths.ts"
Cohesion: 0.73
Nodes (5): asRecord(), flattenJsonSchemaPaths(), isArraySchema(), objectSchemaWithProperties(), schemaBranches()

### Community 107 - "sharp"
Cohesion: 0.36
Nodes (6): parseMeetingTopicIdQuery(), parsePublicKey(), parseSessionIdQuery(), parseAvailabilityRangeQuery(), parseBookMeetingDto(), parseCreateMeetingTopicDto()

### Community 108 - "DeepseekClient"
Cohesion: 0.18
Nodes (10): AnalyticsCategoryInterface, AnalyticsOptionSeed, PROJECT_ANALYTICS_ANSWERABLE_SEEDS, PROJECT_ANALYTICS_CATEGORY_SEEDS, PROJECT_ANALYTICS_GAP_SEEDS, PROJECT_ANALYTICS_INTENT_SEEDS, PROJECT_ANALYTICS_OPTION_SEEDS, PROJECT_ANALYTICS_TYPE_SEEDS (+2 more)

### Community 109 - "user.route.ts"
Cohesion: 0.25
Nodes (3): UserController, router, userController

### Community 110 - "liveAgentFrustration.ts"
Cohesion: 0.22
Nodes (15): choiceIsYes(), clamp01(), emptySignals(), evaluateLiveAgentFrustration(), failOpenOnLayaError(), FrustrationSignals, isChoiceAnswer(), isScoreAnswer() (+7 more)

### Community 111 - "widget.route.ts"
Cohesion: 0.29
Nodes (6): canWidget, imageUpload, meetingToolController, router, ticketController, widgetController

### Community 112 - "apiKey.route.ts"
Cohesion: 0.33
Nodes (5): apiKeyController, collaboratorController, inviteController, requireOwner, router

### Community 113 - "snippet.route.ts"
Cohesion: 0.33
Nodes (5): canTrainSnippets, imageUpload, requireTrain, router, snippetController

### Community 115 - "verifyPublicSessionId"
Cohesion: 0.38
Nodes (9): mapPool(), onSignal(), PendingLean, pollOne(), processCycle(), runPaymentPollCycleNow(), scheduleNext(), startPaymentPoller() (+1 more)

### Community 116 - "guidance.route.ts"
Cohesion: 0.50
Nodes (3): canTrainGuidance, guidanceController, router

### Community 117 - "LlmTokenUsage"
Cohesion: 0.26
Nodes (10): chatTurnWithQuota(), ChatTurnWithQuotaOptions, ChatTurnWithQuotaResult, ChatWithQuotaOptions, estimateTokensFromMessages(), recordTokens(), toObjectId(), usageFromTurn() (+2 more)

### Community 118 - "agent.route.ts"
Cohesion: 0.14
Nodes (10): requireUser, agentController, router, batchTestController, canTest, router, canMeeting, router (+2 more)

### Community 119 - "meetingTool.route.ts"
Cohesion: 0.43
Nodes (4): findOwnedArticleFile(), uploadArticleFile(), processArticleImage(), assertImageFile()

### Community 124 - ".updateSettings"
Cohesion: 0.57
Nodes (3): LiveAgentSettingsOutDto, generateLiveAgentCode(), isDuplicateKeyError()

### Community 125 - ".applyMidtransStatus"
Cohesion: 0.38
Nodes (3): InvoiceDoc, MidtransNotificationPayload, MidtransStatusResult

### Community 126 - "payment.config.ts"
Cohesion: 0.48
Nodes (5): defaultsForBuild(), loadPaymentPollConfig(), parseNonNegativeInt(), parsePositiveInt(), PaymentPollConfig

### Community 127 - "invoice.model.ts"
Cohesion: 0.47
Nodes (4): INVOICE_STATUSES, InvoiceInterface, InvoiceStatus, InvoiceSchema

## Knowledge Gaps
- **454 isolated node(s):** `name`, `version`, `description`, `dev`, `start` (+449 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `meetingTool.controller.ts` to `index.ts`, `auth.service.ts`, `AppConfig.service.ts`, `job.dto.ts`, `modelRegistry.ts`, `JobService`, `articleBucket.ts`, `widget.service.ts`, `agent.graph.ts`, `agent.service.ts`, `AuthController`, `mail.service.ts`, `logger.ts`, `AdminService`, `.chunkArticle`, `topicValidation.ts`, `sharp-phash`, `mongoose`, `agent.state.ts`, `user.service.ts`, `parseApiKeyId`, `socket.ts`, `rerankerClient.ts`, `UserModel`, `chatSession.model.ts`, `migrateNestedSettings.ts`, `liveAgentFrustration.ts`, `verifyPublicSessionId`, `LlmTokenUsage`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `statusForMessage()` connect `widget.controller.ts` to `MeetingToolService`, `apiKeyCollaborationInvite.controller.ts`, `apiKey.service.ts`, `article.controller.ts`, `GuidanceController`, `AppConfig.service.ts`, `McpController`, `sharp`, `jobValidation.ts`, `job.dto.ts`, `OllamaClient`, `chatSession.model.ts`, `message.model.ts`, `chatAnalytics.service.ts`, `PUBLIC_CAPABILITIES`, `chatAnalytics.controller.ts`, `WidgetService`, `apiKeyCollaborator.controller.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `ArticleService` connect `article.service.ts` to `apiKey.service.ts`, `article.controller.ts`, `meetingTool.route.ts`, `deepseekClient.ts`, `WidgetService`, `agent.state.ts`, `agent.graph.ts`, `widgetValidation.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _454 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `auth.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10931174089068826 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._