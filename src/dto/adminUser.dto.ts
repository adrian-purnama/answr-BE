export interface AdminUserOutDto {
  id: string;
  email: string;
  planId: string | null;
  planName: string | null;
  /**
   * Derived from cached planPeriodUntil.
   * ISO timestamp, or null when the plan never expires (sentinel).
   */
  planExpiresAt: string | null;
  isAdmin: boolean;
  isBlocked: boolean;
}

export interface AdminUserListOutDto {
  items: AdminUserOutDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UpdateAdminUserDto {
  password?: string;
}

export interface AdminUserArticleDto {
  id: string;
  title: string;
  topicCount: number;
}

export interface AdminUserBatchDto {
  id: string;
  name: string;
  questionCount: number;
}

export interface AdminUserProjectDto {
  id: string;
  label: string;
  articles: AdminUserArticleDto[];
  guidanceCount: number;
  snippetCount: number;
  batches: AdminUserBatchDto[];
  liveAgentCount: number;
  mcpCount: number;
  meetingTopicCount: number;
  /** Null when the plan does not include lead capture. */
  leadCount: number | null;
}

export interface AdminUserSharedProjectDto {
  id: string;
  label: string;
}

export interface AdminDeepseekWindowDto {
  windowIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface AdminUserDetailOutDto extends AdminUserOutDto {
  accountCreatedAt: string;
  deepseekQuotaPerPeriod: number;
  deepseekWindow: AdminDeepseekWindowDto | null;
  /** Current period id when a period covers now; independent of timeline pagination. */
  currentPeriodId: string | null;
  currentPeriodWindowCount: number | null;
  projects: AdminUserProjectDto[];
  sharedProjects: AdminUserSharedProjectDto[];
}
