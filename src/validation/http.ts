import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../dto/apiResponse.dto";

export function requireUserId(
  req: Request,
  res: Response,
): Types.ObjectId | null {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
      data: null,
    } satisfies ApiResponseDto);
    return null;
  }
  return req.user._id;
}

/** Map common service error messages to HTTP status codes. */
export function statusForMessage(message: string, fallback = 400): number {
  if (
    message === "API key not found" ||
    message === "Widget not found" ||
    message === "Media not found" ||
    message === "Article not found" ||
    message === "Topic not found" ||
    message === "File not found" ||
    message === "Chat session not found" ||
    message === "Chat session expired" ||
    message === "Live agent not found" ||
    message === "Ticket not found" ||
    message === "Snippet not found" ||
    message === "Guidance not found" ||
    message === "Batch test group not found" ||
    message === "Batch test question not found" ||
    message === "MCP not found" ||
    message === "MCP tool not found" ||
    message === "Meeting not found" ||
    message === "Meeting tool config not found" ||
    message === "Meeting topic not found" ||
    message === "News not found" ||
    message === "Analytics record not found" ||
    message === "Analytics category not found" ||
    message === "Plan not found" ||
    message === "Invoice not found" ||
    message === "User not found" ||
    message === "Invalid invitation" ||
    message === "Collaborator not found" ||
    message === "Lead not found"
  ) {
    return 404;
  }

  if (message === "Analytics record has no gap") {
    return 400;
  }

  if (
    message === "Visitor authentication required" ||
    message === "Visitor token expired" ||
    message === "Invalid or expired visitor token" ||
    message === "Visitor tokens are not accepted in anonymous access mode" ||
    message === "Invalid name, password, or code"
  ) {
    return 401;
  }

  if (
    message === "Ticket already claimed" ||
    message === "Ticket already closed" ||
    message.includes("already exists") ||
    message.includes("already running") ||
    message === "Rating already submitted" ||
    message === "This invitation has already been used"
  ) {
    return 409;
  }

  if (
    message.includes("limit reached") ||
    message.includes("revoked") ||
    message.includes("disabled") ||
    message.includes("not active") ||
    message.includes("does not include") ||
    message.includes("Only the assigned") ||
    message.includes("Only the API key owner") ||
    message === "You do not have access to this API key" ||
    message.includes("authentication") ||
    message.includes("expired") ||
    message.includes("lookback is limited")
  ) {
    return 403;
  }

  if (message.startsWith("MCP connect failed")) {
    return 502;
  }

  if (message === "Too many messages") {
    return 429;
  }

  return fallback;
}
