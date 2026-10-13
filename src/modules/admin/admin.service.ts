import { Types } from "mongoose";
import {
  appConfigService,
  type ChangeAppLogoInput,
} from "../appConfig/AppConfig.service";
import type {
  AdminUserDetailOutDto,
  AdminUserProjectDto,
  UpdateAdminUserDto,
} from "../../dto/adminUser.dto";
import type { CreatePlanDto, UpdatePlanDto } from "../../dto/plan.dto";
import { apiKeyService } from "../apiKey/apiKey.service";
import { articleService } from "../article/article.service";
import { batchTestService } from "../batchTest/batchTest.service";
import { guidanceService } from "../guidance/guidance.service";
import { leadCaptureService } from "../leadCapture/leadCapture.service";
import { liveAgentService } from "../liveAgent/liveAgent.service";
import { mcpService } from "../mcp/mcp.service";
import { meetingToolService } from "../meetingTool/meetingTool.service";
import { planService } from "../plan/plan.service";
import { snippetService } from "../snippet/snippet.service";
import type { CreateAdminInvoiceDto } from "../../dto/invoice.dto";
import type {
  AddPlanPeriodsDto,
  AdjustPeriodTokensDto,
} from "../../dto/userPlanPeriod.dto";
import {
  getPlanPeriodSyncStatus,
  runPlanPeriodSyncNow,
} from "../userPlanPeriod/planPeriodGap.worker";
import { userPlanPeriodService } from "../userPlanPeriod/userPlanPeriod.service";
import { invoiceService } from "../payment/invoice.service";
import { userService } from "../user/user.service";

export type UpdateAppConfigInput = {
  appName?: string;
  openLogin?: boolean;
  openRegister?: boolean;
};

export class AdminService {
  getAppConfig() {
    return appConfigService.getAppConfig();
  }

  async updateAppConfig(input: UpdateAppConfigInput) {
    if (input.appName !== undefined) {
      await appConfigService.changeAppName(input.appName);
    }
    if (input.openLogin !== undefined) {
      await appConfigService.changeOpenLogin(input.openLogin);
    }
    if (input.openRegister !== undefined) {
      await appConfigService.changeOpenRegister(input.openRegister);
    }
    return appConfigService.getAppConfig();
  }

  updateAppLogo(input: ChangeAppLogoInput) {
    return appConfigService.changeAppLogo(input);
  }

  getAllPlans() {
    return planService.getAll();
  }

  createPlan(input: CreatePlanDto) {
    return planService.create(input);
  }

  updatePlan(id: string, patch: UpdatePlanDto) {
    return planService.update(id, patch);
  }

  deletePlan(id: string) {
    return planService.delete(id);
  }

  listUsers(input: { email: string; page: number; pageSize: number }) {
    return userService.listForAdmin(input);
  }

  updateUser(id: string, patch: UpdateAdminUserDto) {
    return userService.updateByAdmin(id, patch);
  }

  getPlanPeriodSyncStatus() {
    return getPlanPeriodSyncStatus();
  }

  runPlanPeriodSync() {
    return runPlanPeriodSyncNow();
  }

  listPlanPeriods(
    userId: string,
    opts: { page?: number; pageSize?: number } = {},
  ) {
    return userPlanPeriodService.listTimeline(
      new Types.ObjectId(userId),
      opts,
    );
  }

  getCurrentPeriodQuota(userId: string) {
    return userPlanPeriodService.getCurrentPeriodQuota(
      new Types.ObjectId(userId),
    );
  }

  adjustPeriodTokens(
    userId: string,
    periodId: string,
    input: AdjustPeriodTokensDto,
    adminUserId: Types.ObjectId | null,
  ) {
    return userPlanPeriodService.adjustTokens(
      new Types.ObjectId(userId),
      new Types.ObjectId(periodId),
      input,
      adminUserId,
    );
  }

  createUserInvoice(
    userId: string,
    input: CreateAdminInvoiceDto,
    adminUserId: Types.ObjectId,
  ) {
    return invoiceService.createAdminInvoice(
      new Types.ObjectId(userId),
      input,
      adminUserId,
    );
  }

  listUserInvoices(userId: string) {
    return invoiceService.listForAdminUser(new Types.ObjectId(userId));
  }

  markInvoicePaid(
    invoiceId: string,
    note: string,
    adminUserId: Types.ObjectId,
  ) {
    return invoiceService.markPaidManually(
      new Types.ObjectId(invoiceId),
      note,
      adminUserId,
    );
  }

  previewPlanPeriods(userId: string, input: AddPlanPeriodsDto) {
    return userPlanPeriodService.previewPeriods(
      new Types.ObjectId(userId),
      input,
    );
  }

  addPlanPeriods(
    userId: string,
    input: AddPlanPeriodsDto,
    createdBy: Types.ObjectId | null,
  ) {
    return userPlanPeriodService.addPeriods(
      new Types.ObjectId(userId),
      input,
      createdBy,
    );
  }

  removePlanPeriod(userId: string, periodId: string) {
    return userPlanPeriodService.removePeriod(
      new Types.ObjectId(userId),
      new Types.ObjectId(periodId),
    );
  }

  async getUserDetail(id: string): Promise<AdminUserDetailOutDto> {
    const record = await userService.getForAdmin(id);
    const userId = new Types.ObjectId(record.user.id);
    const keys = await apiKeyService.listForUser(userId);
    const owned = keys.filter((key) => key.role === "owner");
    const shared = keys.filter((key) => key.role === "collaborator");

    const projects = await Promise.all(
      owned.map((key) => this.projectDetail(userId, key.id, key.label)),
    );

    const currentQuota = await userPlanPeriodService.getCurrentPeriodQuota(userId);

    return {
      ...record.user,
      accountCreatedAt: record.accountCreatedAt,
      deepseekQuotaPerPeriod:
        currentQuota?.deepseekQuotaPerPeriod ?? record.deepseekQuotaPerPeriod,
      deepseekWindow:
        currentQuota?.deepseekWindow ?? record.deepseekWindow,
      currentPeriodId: currentQuota?.periodId ?? null,
      currentPeriodWindowCount: currentQuota?.windowCount ?? null,
      projects,
      sharedProjects: shared.map((key) => ({ id: key.id, label: key.label })),
    };
  }

  private async projectDetail(
    userId: Types.ObjectId,
    apiKeyId: string,
    label: string,
  ): Promise<AdminUserProjectDto> {
    const keyId = new Types.ObjectId(apiKeyId);
    const [articles, guidances, snippets, batches, agents, mcps, meetings, leads] =
      await Promise.all([
        articleService.list(userId, keyId).catch(() => []),
        guidanceService.list(userId, keyId).catch(() => []),
        snippetService.list(userId, keyId).catch(() => []),
        batchTestService.listGroups(userId, keyId).catch(() => []),
        liveAgentService.list(userId, keyId).catch(() => []),
        mcpService.list(userId, keyId).catch(() => []),
        meetingToolService.listTopics(userId, keyId).catch(() => ({
          topics: [],
          planAllows: false,
          maxMeetingTopics: 0,
        })),
        leadCaptureService.listLeads(userId, keyId).then(
          (rows) => rows.length,
          () => null,
        ),
      ]);

    const articleRows = await Promise.all(
      articles.map(async (article) => {
        try {
          const topics = await articleService.listTopics(
            userId,
            keyId,
            article.id,
          );
          return {
            id: article.id,
            title: article.title,
            topicCount: topics.length,
          };
        } catch {
          return {
            id: article.id,
            title: article.title,
            topicCount: 0,
          };
        }
      }),
    );

    return {
      id: apiKeyId,
      label,
      articles: articleRows,
      guidanceCount: guidances.length,
      snippetCount: snippets.length,
      batches: batches.map((group) => ({
        id: group.id,
        name: group.name,
        questionCount: group.questionCount,
      })),
      liveAgentCount: agents.length,
      mcpCount: mcps.length,
      meetingTopicCount: meetings.topics.length,
      leadCount: leads,
    };
  }
}
