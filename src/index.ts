import http from "http";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { connectDatabase } from "./database/database";
import { migrateNestedApiKeySettings } from "./models/apiKey/migrateNestedSettings";
import { env } from "./environment/env";
import { appConfigService } from "./modules/appConfig/AppConfig.service";
import { logger } from "./logger/logger";
import {
  debugClientIp,
  globalRateLimit,
} from "./rateLimit/rateLimit.middleware";
import { initLiveAgentSocket } from "./realtime/socket";
import adminRoutes from "./modules/admin/admin.route";
import agentRoutes from "./modules/agent/agent.route";
import apiKeyRoutes from "./modules/apiKey/apiKey.route";
import apiKeyCollaborationInviteRoutes from "./modules/apiKeyCollaborationInvite/apiKeyCollaborationInvite.route";
import appConfigRoutes from "./modules/appConfig/AppConfig.route";
import articleRoutes from "./modules/article/article.route";
import authRoutes from "./modules/auth/auth.route";
import guidanceRoutes from "./modules/guidance/guidance.route";
import liveAgentRoutes from "./modules/liveAgent/liveAgent.route";
import mcpRoutes from "./modules/mcp/mcp.route";
import mediaRoutes from "./modules/media/media.route";
import leadCaptureRoutes from "./modules/leadCapture/leadCapture.route";
import meetingToolRoutes from "./modules/meetingTool/meetingTool.route";
import whatsAppRoutes from "./modules/whatsApp/whatsApp.route";
import planRoutes from "./modules/plan/plan.route";
import paymentRoutes from "./modules/payment/midtrans.route";
import snippetRoutes from "./modules/snippet/snippet.route";
import batchTestRoutes from "./modules/batchTest/batchTest.route";
import chatAnalyticsRoutes from "./modules/chatAnalytics/chatAnalytics.route";
import { chatAnalyticsService } from "./modules/chatAnalytics/chatAnalytics.service";
import { batchTestService } from "./modules/batchTest/batchTest.service";
import { startLeadSummaryWorker } from "./modules/leadCapture/leadSummary.worker";
import { startChatAnalyticsWorker } from "./modules/chatAnalytics/chatAnalytics.worker";
import { migrateUserPlanPeriods } from "./modules/userPlanPeriod/migrateUserPlanPeriods";
import { startPlanPeriodGapWorker } from "./modules/userPlanPeriod/planPeriodGap.worker";
import { startPaymentPoller } from "./modules/payment/paymentPoller.service";
import userRoutes from "./modules/user/user.route";
import widgetAnalyticsRoutes from "./modules/widgetAnalytics/widgetAnalytics.route";
import widgetRoutes from "./modules/widget/widget.route";
import uiTemplateRoutes from "./modules/uiTemplate/uiTemplate.route";

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", env.trustProxy === 0 ? false : env.trustProxy);

  app.use(
    cors({
      origin: env.frontendUrl,
    }),
  );
  if (env.build === "development") {
    app.use(debugClientIp());
  }
  app.use(globalRateLimit());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      message: "Server is healthy",
      data: { build: env.build },
    });
  });

  app.use("/auth", authRoutes);
  app.use("/agents", agentRoutes);
  app.use("/api-keys", apiKeyRoutes);
  app.use("/api-key-collaboration-invites", apiKeyCollaborationInviteRoutes);
  app.use("/articles", articleRoutes);
  app.use("/admin", adminRoutes);
  app.use("/app-config", appConfigRoutes);
  app.use("/guidances", guidanceRoutes);
  app.use("/lead-capture", leadCaptureRoutes);
  app.use("/whatsapp", whatsAppRoutes);
  app.use("/live-agents", liveAgentRoutes);
  app.use("/mcps", mcpRoutes);
  app.use("/ui-templates", uiTemplateRoutes);
  app.use("/media", mediaRoutes);
  app.use("/meeting-tool", meetingToolRoutes);
  app.use("/plans", planRoutes);
  app.use("/payment", paymentRoutes);
  app.use("/snippets", snippetRoutes);
  app.use("/batch-tests", batchTestRoutes);
  app.use("/chat-analytics", chatAnalyticsRoutes);
  app.use("/widget-analytics", widgetAnalyticsRoutes);
  app.use("/user", userRoutes);
  app.use("/widgets", widgetRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(
      err instanceof Error ? err.message : "Unhandled server error",
      "index",
      "createApp",
    );

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  });

  return app;
}

async function bootstrap() {
  await connectDatabase(env.mongodbUrl, env.build);
  await migrateNestedApiKeySettings();
  await batchTestService.releaseStuckRuns();
  await appConfigService.init();
  await chatAnalyticsService.ensureSystemCategories();
  await startLeadSummaryWorker();
  await startChatAnalyticsWorker();
  await migrateUserPlanPeriods();
  await startPlanPeriodGapWorker();
  await startPaymentPoller();

  const app = createApp();
  const httpServer = http.createServer(app);
  initLiveAgentSocket(httpServer);

  httpServer.listen(env.port, () => {
    logger.info(
      `Server running at http://localhost:${env.port} (${env.build})`,
      "index",
      "bootstrap",
    );
  });
}

bootstrap().catch((err) => {
  logger.error(
    err instanceof Error ? err.message : String(err),
    "index",
    "bootstrap",
  );
  process.exit(1);
});
