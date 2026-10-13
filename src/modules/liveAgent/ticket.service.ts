import { Types } from "mongoose";
import type {
  LiveAgentTicketDetailOutDto,
  LiveAgentTicketMessageOutDto,
  LiveAgentTicketOutDto,
  PostLiveAgentTicketMessageDto,
  SubmitLiveAgentTicketRatingDto,
} from "../../dto/liveAgentTicket.dto";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { ChatSessionModel } from "../../models/chatSession/chatSession.model";
import type { ChatMessageInterface } from "../../models/message/message.interface";
import { ChatMessageModel } from "../../models/message/message.model";
import type { LiveAgentTicketInterface } from "../../models/liveAgentTicket/liveAgentTicket.interface";
import { LiveAgentTicketModel } from "../../models/liveAgentTicket/liveAgentTicket.model";
import type { LiveAgentTicketMessageInterface } from "../../models/liveAgentTicketMessage/liveAgentTicketMessage.interface";
import { LiveAgentTicketMessageModel } from "../../models/liveAgentTicketMessage/liveAgentTicketMessage.model";
import { LiveAgentModel } from "../../models/liveAgent/liveAgent.model";
import { LIVE_AGENT_SOCKET_EVENTS } from "../../realtime/liveAgentEvents";
import { emitToQueue, emitToTicket } from "../../realtime/socket";
import { textFromMessage } from "../agent/agent.messages";
import { mailer } from "../mail/mail.service";
import { widgetService } from "../widget/widget.service";
import { toolGuardService } from "../toolGuard/toolGuard.service";
import { entitlementService } from "../entitlement/entitlement.service";
import { logger } from "../../logger/logger";

type TicketDoc = LiveAgentTicketInterface & { _id: Types.ObjectId };
type MessageDoc = LiveAgentTicketMessageInterface & { _id: Types.ObjectId };

const AI_CONTEXT_LIMIT = 40;
const SESSION_EXTEND_MS = 24 * 60 * 60 * 1000;

function previewOf(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
}

function toTicketOutDto(
  doc: TicketDoc,
  queuePosition?: number | null,
): LiveAgentTicketOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    publicKey: doc.publicKey,
    chatSessionId: doc.chatSessionId.toString(),
    visitorAuthMode: doc.visitorAuthMode,
    visitorSub: doc.visitorSub,
    visitorClaims: doc.visitorClaims ?? {},
    status: doc.status,
    assignedAgentId: doc.assignedAgentId
      ? doc.assignedAgentId.toString()
      : null,
    assignedAgentName: doc.assignedAgentName,
    assignedAgentProfilePicture: doc.assignedAgentProfilePicture ?? null,
    latestMessagePreview: doc.latestMessagePreview ?? "",
    queuedAt: doc.queuedAt.toISOString(),
    claimedAt: doc.claimedAt ? doc.claimedAt.toISOString() : null,
    closedAt: doc.closedAt ? doc.closedAt.toISOString() : null,
    rating: doc.rating
      ? {
          stars: doc.rating.stars,
          feedback: doc.rating.feedback ?? "",
          submittedAt: doc.rating.submittedAt.toISOString(),
        }
      : null,
    queuePosition: queuePosition ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toTicketDetailDto(
  doc: TicketDoc,
  queuePosition?: number | null,
): LiveAgentTicketDetailOutDto {
  return {
    ...toTicketOutDto(doc, queuePosition),
    aiContext: (doc.aiContext ?? []).map((turn) => ({
      role: turn.role,
      text: turn.text,
      createdAt: turn.createdAt.toISOString(),
    })),
  };
}

function toMessageDto(doc: MessageDoc): LiveAgentTicketMessageOutDto {
  return {
    id: doc._id.toString(),
    ticketId: doc.ticketId.toString(),
    senderType: doc.senderType,
    senderId: doc.senderId,
    text: doc.text,
    createdAt: doc.createdAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

export class LiveAgentTicketService {
  async computeQueuePosition(ticket: TicketDoc): Promise<number | null> {
    if (ticket.status !== "queued") return null;
    const ahead = await LiveAgentTicketModel.countDocuments({
      apiKeyId: ticket.apiKeyId,
      status: "queued",
      queuedAt: { $lte: ticket.queuedAt },
    });
    return ahead;
  }

  private async emitQueuePositions(apiKeyId: Types.ObjectId): Promise<void> {
    const queued = await LiveAgentTicketModel.find({
      apiKeyId,
      status: "queued",
    })
      .sort({ queuedAt: 1 })
      .lean<TicketDoc[]>();

    queued.forEach((ticket, index) => {
      emitToTicket(ticket._id.toString(), LIVE_AGENT_SOCKET_EVENTS.QUEUE_POSITION, {
        ticketId: ticket._id.toString(),
        position: index + 1,
      });
    });
  }

  private async broadcastTicket(
    event: string,
    ticket: TicketDoc,
    queuePosition?: number | null,
  ): Promise<void> {
    const payload = toTicketOutDto(ticket, queuePosition);
    emitToTicket(ticket._id.toString(), event, payload);
    emitToQueue(ticket.apiKeyId.toString(), event, payload);
    emitToQueue(ticket.apiKeyId.toString(), LIVE_AGENT_SOCKET_EVENTS.QUEUE_UPDATED, {
      apiKeyId: ticket.apiKeyId.toString(),
    });
  }

  private async snapshotAiContext(
    sessionId: Types.ObjectId,
  ): Promise<LiveAgentTicketInterface["aiContext"]> {
    const docs = await ChatMessageModel.find({
      sessionId,
      role: { $in: ["user", "assistant"] },
    })
      .sort({ createdAt: 1 })
      .limit(AI_CONTEXT_LIMIT)
      .lean<ChatMessageInterface[]>();

    return docs
      .map((doc) => {
        const text = textFromMessage(doc).trim();
        if (!text) return null;
        if (doc.role !== "user" && doc.role !== "assistant") return null;
        return {
          role: doc.role,
          text,
          createdAt: doc.createdAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  async createForVisitor(
    publicKey: string,
    sessionId: string,
  ): Promise<LiveAgentTicketOutDto> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );

    const apiKey = await ApiKeyModel.findById(session.apiKeyId).lean();
    if (!apiKey || apiKey.status.status !== "active") {
      throw new Error("Project is not active");
    }
    if (!apiKey.liveAgentSetting?.enabled) {
      throw new Error("Live agent is disabled for this project");
    }

    const planAllows = await entitlementService.hasLiveAgent(
      apiKey.userId,
      apiKey._id,
    );
    if (!planAllows) {
      throw new Error("Your plan does not include Live Agent");
    }

    const existing = await LiveAgentTicketModel.findOne({
      chatSessionId: session._id,
      status: { $in: ["queued", "claimed"] },
    }).lean<TicketDoc>();

    if (existing) {
      const position = await this.computeQueuePosition(existing);
      return toTicketOutDto(existing, position);
    }

    const writeKey = `live_agent_ticket:${session._id.toString()}`;
    if (!toolGuardService.claimWrite(writeKey)) {
      const raced = await LiveAgentTicketModel.findOne({
        chatSessionId: session._id,
        status: { $in: ["queued", "claimed"] },
      }).lean<TicketDoc>();
      if (raced) {
        const position = await this.computeQueuePosition(raced);
        return toTicketOutDto(raced, position);
      }
    }

    const aiContext = await this.snapshotAiContext(session._id);
    const latestFromAi =
      aiContext.length > 0 ? previewOf(aiContext[aiContext.length - 1]!.text) : "";

    await ChatSessionModel.updateOne(
      { _id: session._id },
      { $set: { expiredAt: new Date(Date.now() + SESSION_EXTEND_MS) } },
    );

    let created: TicketDoc;
    try {
      const doc = await LiveAgentTicketModel.create({
        apiKeyId: session.apiKeyId,
        userId: session.userId,
        publicKey: session.publicKey,
        chatSessionId: session._id,
        visitorAuthMode: session.visitorAuthMode,
        visitorSub: session.visitor?.sub ?? null,
        visitorClaims: session.visitor?.claims ?? {},
        status: "queued",
        assignedAgentId: null,
        assignedAgentName: null,
        assignedAgentProfilePicture: null,
        aiContext,
        latestMessagePreview: latestFromAi,
        queuedAt: new Date(),
        claimedAt: null,
        closedAt: null,
        rating: null,
      });
      created = doc.toObject() as TicketDoc;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await LiveAgentTicketModel.findOne({
          chatSessionId: session._id,
          status: { $in: ["queued", "claimed"] },
        }).lean<TicketDoc>();
        if (raced) {
          const position = await this.computeQueuePosition(raced);
          return toTicketOutDto(raced, position);
        }
      }
      throw error;
    }

    const systemText = "Live agent request queued. A human agent will join shortly.";
    await LiveAgentTicketMessageModel.create({
      ticketId: created._id,
      apiKeyId: created.apiKeyId,
      senderType: "system",
      senderId: "system",
      text: systemText,
    });

    const position = await this.computeQueuePosition(created);
    await this.broadcastTicket(
      LIVE_AGENT_SOCKET_EVENTS.TICKET_CREATED,
      created,
      position,
    );
    await this.emitQueuePositions(created.apiKeyId);
    emitToTicket(created._id.toString(), LIVE_AGENT_SOCKET_EVENTS.TICKET_MESSAGE, {
      id: "",
      ticketId: created._id.toString(),
      senderType: "system",
      senderId: "system",
      text: systemText,
      createdAt: new Date().toISOString(),
    });

    const notifyEmail = (apiKey.liveAgentSetting?.notifyEmail ?? "").trim();
    if (notifyEmail) {
      void mailer
        .sendLiveAgentTicketCreated(notifyEmail, {
          projectLabel: apiKey.label ?? "",
          queuePosition: position,
          visitorPreview: created.latestMessagePreview || systemText,
          joinCode: (apiKey.liveAgentSetting?.code ?? "").trim().toUpperCase(),
        })
        .catch((error) => {
          logger.error(
            error instanceof Error ? error.message : String(error),
            "modules/liveAgent/ticket.service.ts",
            "createForVisitor.notifyEmail",
          );
        });
    }

    return toTicketOutDto(created, position);
  }

  async getActiveForVisitor(
    publicKey: string,
    sessionId: string,
  ): Promise<LiveAgentTicketOutDto | null> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    const active = await LiveAgentTicketModel.findOne({
      publicKey: publicKey.trim(),
      chatSessionId: session._id,
      status: { $in: ["queued", "claimed"] },
    }).lean<TicketDoc>();

    if (active) {
      const position = await this.computeQueuePosition(active);
      return toTicketOutDto(active, position);
    }

    const closedPendingRating = await LiveAgentTicketModel.findOne({
      publicKey: publicKey.trim(),
      chatSessionId: session._id,
      status: "closed",
      rating: null,
    })
      .sort({ closedAt: -1 })
      .lean<TicketDoc>();

    if (!closedPendingRating) return null;
    return toTicketOutDto(closedPendingRating, null);
  }

  async getForVisitor(
    publicKey: string,
    sessionId: string,
    ticketId: string,
  ): Promise<LiveAgentTicketDetailOutDto> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    const ticket = await this.findVisitorTicket(
      publicKey,
      session._id.toString(),
      ticketId,
    );
    const position = await this.computeQueuePosition(ticket);
    return toTicketDetailDto(ticket, position);
  }

  async listMessagesForVisitor(
    publicKey: string,
    sessionId: string,
    ticketId: string,
  ): Promise<LiveAgentTicketMessageOutDto[]> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    await this.findVisitorTicket(publicKey, session._id.toString(), ticketId);
    const docs = await LiveAgentTicketMessageModel.find({
      ticketId: new Types.ObjectId(ticketId),
    })
      .sort({ createdAt: 1 })
      .lean<MessageDoc[]>();
    return docs.map(toMessageDto);
  }

  async postVisitorMessage(
    publicKey: string,
    sessionId: string,
    ticketId: string,
    input: PostLiveAgentTicketMessageDto,
  ): Promise<LiveAgentTicketMessageOutDto> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    const ticket = await this.findVisitorTicket(
      publicKey,
      session._id.toString(),
      ticketId,
    );
    if (ticket.status === "closed") {
      throw new Error("Ticket is closed");
    }

    await ChatSessionModel.updateOne(
      { _id: ticket.chatSessionId },
      { $set: { expiredAt: new Date(Date.now() + SESSION_EXTEND_MS) } },
    );

    const senderId = ticket.visitorSub ?? "anonymous";
    const message = await LiveAgentTicketMessageModel.create({
      ticketId: ticket._id,
      apiKeyId: ticket.apiKeyId,
      senderType: "visitor",
      senderId,
      text: input.text,
    });

    await LiveAgentTicketModel.updateOne(
      { _id: ticket._id },
      { $set: { latestMessagePreview: previewOf(input.text) } },
    );

    const dto = toMessageDto(message.toObject() as MessageDoc);
    emitToTicket(ticket._id.toString(), LIVE_AGENT_SOCKET_EVENTS.TICKET_MESSAGE, dto);
    emitToQueue(ticket.apiKeyId.toString(), LIVE_AGENT_SOCKET_EVENTS.TICKET_UPDATED, {
      ...toTicketOutDto({ ...ticket, latestMessagePreview: previewOf(input.text) }),
    });
    return dto;
  }

  async submitRating(
    publicKey: string,
    sessionId: string,
    ticketId: string,
    input: SubmitLiveAgentTicketRatingDto,
  ): Promise<LiveAgentTicketOutDto> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    const ticket = await this.findVisitorTicket(
      publicKey,
      session._id.toString(),
      ticketId,
    );
    if (ticket.status !== "closed") {
      throw new Error("Ticket must be closed before rating");
    }
    if (ticket.rating) {
      throw new Error("Rating already submitted");
    }

    const rating = {
      stars: input.stars,
      feedback: input.feedback?.trim() ?? "",
      submittedAt: new Date(),
    };

    const updated = await LiveAgentTicketModel.findOneAndUpdate(
      { _id: ticket._id, rating: null, status: "closed" },
      { $set: { rating } },
      { new: true },
    ).lean<TicketDoc>();

    if (!updated) {
      throw new Error("Rating already submitted");
    }

    await this.broadcastTicket(LIVE_AGENT_SOCKET_EVENTS.TICKET_UPDATED, updated, null);
    return toTicketOutDto(updated, null);
  }

  async listForAgent(
    apiKeyId: Types.ObjectId,
    status: "queued" | "claimed" | "closed" | "all",
  ): Promise<LiveAgentTicketOutDto[]> {
    const filter: Record<string, unknown> = { apiKeyId };
    if (status !== "all") {
      filter.status = status;
    }
    const docs = await LiveAgentTicketModel.find(filter)
      .sort({ queuedAt: status === "queued" ? 1 : -1 })
      .limit(100)
      .lean<TicketDoc[]>();

    const out: LiveAgentTicketOutDto[] = [];
    for (const doc of docs) {
      const position = await this.computeQueuePosition(doc);
      out.push(toTicketOutDto(doc, position));
    }
    return out;
  }

  async getForAgent(
    apiKeyId: Types.ObjectId,
    ticketId: string,
  ): Promise<LiveAgentTicketDetailOutDto> {
    const ticket = await this.findAgentTicket(apiKeyId, ticketId);
    const position = await this.computeQueuePosition(ticket);
    return toTicketDetailDto(ticket, position);
  }

  async listMessagesForAgent(
    apiKeyId: Types.ObjectId,
    ticketId: string,
  ): Promise<LiveAgentTicketMessageOutDto[]> {
    await this.findAgentTicket(apiKeyId, ticketId);
    const docs = await LiveAgentTicketMessageModel.find({
      ticketId: new Types.ObjectId(ticketId),
      apiKeyId,
    })
      .sort({ createdAt: 1 })
      .lean<MessageDoc[]>();
    return docs.map(toMessageDto);
  }

  async claim(
    apiKeyId: Types.ObjectId,
    agentId: Types.ObjectId,
    agentName: string,
    ticketId: string,
  ): Promise<LiveAgentTicketOutDto> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new Error("Ticket not found");
    }

    const agent = await LiveAgentModel.findOne({
      _id: agentId,
      apiKeyId,
    }).lean<{ name: string; profilePicture?: string }>();
    if (!agent) {
      throw new Error("Live agent not found");
    }

    const resolvedName = agent.name?.trim() || agentName;
    const profilePicture = (agent.profilePicture ?? "").trim() || null;

    const claimed = await LiveAgentTicketModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(ticketId),
        apiKeyId,
        status: "queued",
      },
      {
        $set: {
          status: "claimed",
          assignedAgentId: agentId,
          assignedAgentName: resolvedName,
          assignedAgentProfilePicture: profilePicture,
          claimedAt: new Date(),
        },
      },
      { new: true },
    ).lean<TicketDoc>();

    if (!claimed) {
      const current = await LiveAgentTicketModel.findOne({
        _id: new Types.ObjectId(ticketId),
        apiKeyId,
      }).lean<TicketDoc>();
      if (!current) {
        throw new Error("Ticket not found");
      }
      throw new Error("Ticket already claimed");
    }

    const systemText = `${resolvedName} joined the conversation.`;
    const message = await LiveAgentTicketMessageModel.create({
      ticketId: claimed._id,
      apiKeyId,
      senderType: "system",
      senderId: "system",
      text: systemText,
    });

    await this.broadcastTicket(
      LIVE_AGENT_SOCKET_EVENTS.TICKET_CLAIMED,
      claimed,
      null,
    );
    await this.emitQueuePositions(apiKeyId);
    emitToTicket(
      claimed._id.toString(),
      LIVE_AGENT_SOCKET_EVENTS.TICKET_MESSAGE,
      toMessageDto(message.toObject() as MessageDoc),
    );

    return toTicketOutDto(claimed, null);
  }

  async postAgentMessage(
    apiKeyId: Types.ObjectId,
    agentId: Types.ObjectId,
    ticketId: string,
    input: PostLiveAgentTicketMessageDto,
  ): Promise<LiveAgentTicketMessageOutDto> {
    const ticket = await this.findAgentTicket(apiKeyId, ticketId);
    if (ticket.status !== "claimed") {
      throw new Error("Ticket is not claimed");
    }
    if (
      !ticket.assignedAgentId ||
      ticket.assignedAgentId.toString() !== agentId.toString()
    ) {
      throw new Error("Only the assigned agent can message this ticket");
    }

    const message = await LiveAgentTicketMessageModel.create({
      ticketId: ticket._id,
      apiKeyId,
      senderType: "agent",
      senderId: agentId.toString(),
      text: input.text,
    });

    await LiveAgentTicketModel.updateOne(
      { _id: ticket._id },
      { $set: { latestMessagePreview: previewOf(input.text) } },
    );

    const dto = toMessageDto(message.toObject() as MessageDoc);
    emitToTicket(ticket._id.toString(), LIVE_AGENT_SOCKET_EVENTS.TICKET_MESSAGE, dto);
    return dto;
  }

  async close(
    apiKeyId: Types.ObjectId,
    agentId: Types.ObjectId,
    ticketId: string,
  ): Promise<LiveAgentTicketOutDto> {
    const ticket = await this.findAgentTicket(apiKeyId, ticketId);
    if (ticket.status !== "claimed") {
      throw new Error("Ticket is not claimed");
    }
    if (
      !ticket.assignedAgentId ||
      ticket.assignedAgentId.toString() !== agentId.toString()
    ) {
      throw new Error("Only the assigned agent can close this ticket");
    }

    const closed = await LiveAgentTicketModel.findOneAndUpdate(
      {
        _id: ticket._id,
        apiKeyId,
        status: "claimed",
        assignedAgentId: agentId,
      },
      {
        $set: {
          status: "closed",
          closedAt: new Date(),
        },
      },
      { new: true },
    ).lean<TicketDoc>();

    if (!closed) {
      throw new Error("Ticket already closed");
    }

    const systemText = "This conversation was closed by the live agent.";
    const message = await LiveAgentTicketMessageModel.create({
      ticketId: closed._id,
      apiKeyId,
      senderType: "system",
      senderId: "system",
      text: systemText,
    });

    await this.broadcastTicket(LIVE_AGENT_SOCKET_EVENTS.TICKET_CLOSED, closed, null);
    emitToTicket(
      closed._id.toString(),
      LIVE_AGENT_SOCKET_EVENTS.TICKET_MESSAGE,
      toMessageDto(message.toObject() as MessageDoc),
    );

    return toTicketOutDto(closed, null);
  }

  private async findVisitorTicket(
    publicKey: string,
    sessionId: string,
    ticketId: string,
  ): Promise<TicketDoc> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new Error("Ticket not found");
    }
    const ticket = await LiveAgentTicketModel.findOne({
      _id: new Types.ObjectId(ticketId),
      publicKey: publicKey.trim(),
      chatSessionId: new Types.ObjectId(sessionId),
    }).lean<TicketDoc>();
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    return ticket;
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await LiveAgentTicketMessageModel.deleteMany({ apiKeyId });
    await LiveAgentTicketModel.deleteMany({ apiKeyId });
  }

  private async findAgentTicket(
    apiKeyId: Types.ObjectId,
    ticketId: string,
  ): Promise<TicketDoc> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new Error("Ticket not found");
    }
    const ticket = await LiveAgentTicketModel.findOne({
      _id: new Types.ObjectId(ticketId),
      apiKeyId,
    }).lean<TicketDoc>();
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    return ticket;
  }
}

export const liveAgentTicketService = new LiveAgentTicketService();
