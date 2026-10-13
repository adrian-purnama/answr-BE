import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  LiveAgentTicketDetailOutDto,
  LiveAgentTicketMessageOutDto,
  LiveAgentTicketOutDto,
} from "../../dto/liveAgentTicket.dto";
import {
  parseCreateVisitorLiveAgentTicketDto,
  parseListAgentTicketsQuery,
  parseLiveAgentTicketId,
  parsePostLiveAgentTicketMessageDto,
  parseSessionIdQuery,
  parseSubmitLiveAgentTicketRatingDto,
} from "../../validation/liveAgentTicket";
import { statusForMessage } from "../../validation/http";
import { liveAgentTicketService } from "./ticket.service";

function parsePublicKey(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Widget not found");
  }
  return value.trim();
}

export class LiveAgentTicketController {
  createVisitorTicket = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const input = parseCreateVisitorLiveAgentTicketDto(req.body);
      const data = await liveAgentTicketService.createForVisitor(
        publicKey,
        input.sessionId,
      );
      return res.status(201).json({
        success: true,
        message: "Live agent ticket created",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create ticket";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getActiveVisitorTicket = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const sessionId = parseSessionIdQuery(req.query.sessionId);
      const data = await liveAgentTicketService.getActiveForVisitor(
        publicKey,
        sessionId,
      );
      return res.status(200).json({
        success: true,
        message: data ? "Active ticket retrieved" : "No active ticket",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketOutDto | null>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get ticket";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getVisitorTicket = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const ticketId = parseLiveAgentTicketId(req.params.ticketId);
      const sessionId = parseSessionIdQuery(req.query.sessionId);
      const data = await liveAgentTicketService.getForVisitor(
        publicKey,
        sessionId,
        ticketId,
      );
      return res.status(200).json({
        success: true,
        message: "Ticket retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get ticket";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listVisitorMessages = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const ticketId = parseLiveAgentTicketId(req.params.ticketId);
      const sessionId = parseSessionIdQuery(req.query.sessionId);
      const data = await liveAgentTicketService.listMessagesForVisitor(
        publicKey,
        sessionId,
        ticketId,
      );
      return res.status(200).json({
        success: true,
        message: "Messages retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketMessageOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list messages";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  postVisitorMessage = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const ticketId = parseLiveAgentTicketId(req.params.ticketId);
      const sessionId = parseSessionIdQuery(req.query.sessionId);
      const input = parsePostLiveAgentTicketMessageDto(req.body);
      const data = await liveAgentTicketService.postVisitorMessage(
        publicKey,
        sessionId,
        ticketId,
        input,
      );
      return res.status(201).json({
        success: true,
        message: "Message sent",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketMessageOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  submitVisitorRating = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const ticketId = parseLiveAgentTicketId(req.params.ticketId);
      const sessionId = parseSessionIdQuery(req.query.sessionId);
      const input = parseSubmitLiveAgentTicketRatingDto(req.body);
      const data = await liveAgentTicketService.submitRating(
        publicKey,
        sessionId,
        ticketId,
        input,
      );
      return res.status(200).json({
        success: true,
        message: "Rating submitted",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit rating";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listAgentTickets = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const query = parseListAgentTicketsQuery(req.query.status);
      const data = await liveAgentTicketService.listForAgent(
        req.liveAgent.apiKeyId,
        query.status,
      );
      return res.status(200).json({
        success: true,
        message: "Tickets retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list tickets";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getAgentTicket = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const ticketId = parseLiveAgentTicketId(req.params.id);
      const data = await liveAgentTicketService.getForAgent(
        req.liveAgent.apiKeyId,
        ticketId,
      );
      return res.status(200).json({
        success: true,
        message: "Ticket retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get ticket";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listAgentMessages = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const ticketId = parseLiveAgentTicketId(req.params.id);
      const data = await liveAgentTicketService.listMessagesForAgent(
        req.liveAgent.apiKeyId,
        ticketId,
      );
      return res.status(200).json({
        success: true,
        message: "Messages retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketMessageOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list messages";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  claimTicket = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const ticketId = parseLiveAgentTicketId(req.params.id);
      const data = await liveAgentTicketService.claim(
        req.liveAgent.apiKeyId,
        req.liveAgent._id,
        req.liveAgent.name,
        ticketId,
      );
      return res.status(200).json({
        success: true,
        message: "Ticket claimed",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to claim ticket";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  postAgentMessage = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const ticketId = parseLiveAgentTicketId(req.params.id);
      const input = parsePostLiveAgentTicketMessageDto(req.body);
      const data = await liveAgentTicketService.postAgentMessage(
        req.liveAgent.apiKeyId,
        req.liveAgent._id,
        ticketId,
        input,
      );
      return res.status(201).json({
        success: true,
        message: "Message sent",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketMessageOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  closeTicket = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const ticketId = parseLiveAgentTicketId(req.params.id);
      const data = await liveAgentTicketService.close(
        req.liveAgent.apiKeyId,
        req.liveAgent._id,
        ticketId,
      );
      return res.status(200).json({
        success: true,
        message: "Ticket closed",
        data,
      } satisfies ApiResponseDto<LiveAgentTicketOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to close ticket";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}
