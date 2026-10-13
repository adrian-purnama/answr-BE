import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { Types } from "mongoose";
import { env } from "../environment/env";
import { logger } from "../logger/logger";
import { ApiKeyModel } from "../models/apiKey/apiKey.model";
import { LiveAgentModel } from "../models/liveAgent/liveAgent.model";
import { LiveAgentTicketModel } from "../models/liveAgentTicket/liveAgentTicket.model";
import { verifyLiveAgentToken } from "../utils/jwt";
import { widgetService } from "../modules/widget/widget.service";
import { entitlementService } from "../modules/entitlement/entitlement.service";
import {
  LIVE_AGENT_SOCKET_EVENTS,
  queueRoom,
  ticketRoom,
} from "./liveAgentEvents";

type VisitorAuth = {
  role: "visitor";
  publicKey: string;
  sessionId: string;
};

type AgentAuth = {
  role: "agent";
  agentId: string;
  apiKeyId: string;
  name: string;
};

export type SocketAuth = VisitorAuth | AgentAuth;

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

function readHandshakeAuth(socket: Socket): Record<string, unknown> {
  const auth = socket.handshake.auth;
  return auth && typeof auth === "object"
    ? (auth as Record<string, unknown>)
    : {};
}

async function authenticateSocket(socket: Socket): Promise<SocketAuth> {
  const auth = readHandshakeAuth(socket);
  const role = auth.role;

  if (role === "visitor") {
    const publicKey =
      typeof auth.publicKey === "string" ? auth.publicKey.trim() : "";
    const sessionId =
      typeof auth.sessionId === "string" ? auth.sessionId.trim() : "";
    if (!publicKey || !sessionId) {
      throw new Error("Missing visitor credentials");
    }
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    return { role: "visitor", publicKey, sessionId: session._id.toString() };
  }

  if (role === "agent") {
    const token = typeof auth.token === "string" ? auth.token.trim() : "";
    if (!token) {
      throw new Error("Missing agent token");
    }
    const payload = verifyLiveAgentToken(token);
    const agent = await LiveAgentModel.findById(payload.agentId);
    if (!agent || !agent.enabled) {
      throw new Error("Live agent not found");
    }
    const apiKey = await ApiKeyModel.findById(agent.apiKeyId).lean();
    if (!apiKey || apiKey.status.status !== "active" || !apiKey.liveAgentSetting?.enabled) {
      throw new Error("Live agent is disabled for this project");
    }
    const planAllows = await entitlementService.hasLiveAgent(
      apiKey.userId,
      apiKey._id,
    );
    if (!planAllows) {
      throw new Error("Your plan does not include Live Agent");
    }
    return {
      role: "agent",
      agentId: agent.id,
      apiKeyId: agent.apiKeyId.toString(),
      name: agent.name,
    };
  }

  throw new Error("Invalid socket auth role");
}

export function initLiveAgentSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.frontendUrl,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.on("connection", async (socket) => {
    try {
      const identity = await authenticateSocket(socket);
      socket.data.auth = identity;

      if (identity.role === "agent") {
        await socket.join(queueRoom(identity.apiKeyId));
      }

      if (identity.role === "visitor") {
        const active = await LiveAgentTicketModel.findOne({
          publicKey: identity.publicKey,
          chatSessionId: new Types.ObjectId(identity.sessionId),
          status: { $in: ["queued", "claimed"] },
        }).lean();
        if (active) {
          await socket.join(ticketRoom(active._id.toString()));
        }
      }

      socket.on(LIVE_AGENT_SOCKET_EVENTS.TICKET_TYPING, (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const raw = payload as Record<string, unknown>;
        const ticketId =
          typeof raw.ticketId === "string" ? raw.ticketId.trim() : "";
        const typing = Boolean(raw.typing);
        if (!ticketId || !Types.ObjectId.isValid(ticketId)) return;

        const auth = socket.data.auth as SocketAuth | undefined;
        if (!auth) return;

        const senderType = auth.role === "agent" ? "agent" : "visitor";
        socket.to(ticketRoom(ticketId)).emit(LIVE_AGENT_SOCKET_EVENTS.TICKET_TYPING, {
          ticketId,
          senderType,
          typing,
        });
      });

      socket.on("ticket.join", async (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const ticketId =
          typeof (payload as { ticketId?: unknown }).ticketId === "string"
            ? (payload as { ticketId: string }).ticketId.trim()
            : "";
        if (!ticketId || !Types.ObjectId.isValid(ticketId)) return;

        const auth = socket.data.auth as SocketAuth | undefined;
        if (!auth) return;

        const ticket = await LiveAgentTicketModel.findById(ticketId).lean();
        if (!ticket) return;

        if (auth.role === "visitor") {
          if (
            ticket.publicKey !== auth.publicKey ||
            ticket.chatSessionId.toString() !== auth.sessionId
          ) {
            return;
          }
        } else if (ticket.apiKeyId.toString() !== auth.apiKeyId) {
          return;
        }

        await socket.join(ticketRoom(ticketId));
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        "realtime/socket.ts",
        "connection",
      );
      socket.disconnect(true);
    }
  });

  return io;
}

export function emitToTicket(ticketId: string, event: string, payload: unknown): void {
  getIo()?.to(ticketRoom(ticketId)).emit(event, payload);
}

export function emitToQueue(apiKeyId: string, event: string, payload: unknown): void {
  getIo()?.to(queueRoom(apiKeyId)).emit(event, payload);
}
