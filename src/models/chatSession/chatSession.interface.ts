import { Types } from "mongoose";

export type ChatSessionVisitorAuthMode = "anonymous" | "authenticated";

export type ChatSessionVisitor = {
  sub: string;
  claims: Record<string, unknown>;
  iss: string;
  verifiedAt: Date;
  tokenExp: Date;
};

export interface ChatSessionInterface {
  _id: Types.ObjectId;
  publicKey: string;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  expiredAt: Date;
  visitorAuthMode: ChatSessionVisitorAuthMode;
  visitor: ChatSessionVisitor | null;
  /** Set only for WhatsApp threads. Absent on widget and test sessions. */
  whatsAppChatId?: string;
  /** WAHA poll message id for the menu currently waiting on this chat. */
  flowActivePollId?: string | null;
  /** Menu node that poll belongs to. Labels are unique only inside that menu. */
  flowActiveNodeId?: string | null;
  /** Recent poll.vote ids. Capped so a retry does not advance the flow twice. */
  flowSeenVoteIds?: string[];
  /** Node ids to reopen when the chat picks Back. The root is never on this stack. */
  flowBackStack?: string[];
  createdAt: Date;
  updatedAt: Date;
}
