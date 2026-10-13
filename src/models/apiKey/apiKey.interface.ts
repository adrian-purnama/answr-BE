import { Types } from "mongoose";
import type { LiveAgentResilience } from "../../dto/liveAgent.dto";
import type { LeadCaptureSettingsInterface } from "../leadCapture/leadCapture.interface";

export type { LiveAgentResilience };

/** Project-level live agent config, stored on the API key. */
export interface LiveAgentSetting {
  enabled: boolean;
  /** Join code agents enter at login (unique per project) */
  code?: string;
  /**
   * How much user frustration before the AI recommends a live agent.
   * low = recommend sooner; high = require more frustration; never = tool-only.
   */
  resilience: LiveAgentResilience;
  /** Email notified when a visitor creates a live-agent ticket */
  notifyEmail: string;
}

/** Known WAHA session statuses. `(string & {})` keeps unknown statuses assignable. */
export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | (string & {});

/** Project-level WhatsApp channel config, stored on the API key. */
export interface WhatsAppSetting {
  enabled: boolean;
  /** When true, incoming chats skip the agent. Flow handling is not built yet. */
  defaultFlow: boolean;
  /** WAHA session name: `{userId}-{apiKeyId}` */
  sessionName: string | null;
  status: WahaSessionStatus | null;
  meId: string | null;
  mePushName: string | null;
  /** Event-time watermark. Written only by the webhook path. */
  lastSyncedAt: Date | null;
}

interface ApiKeyStatusInterface {
  status: "active" | "disabled_plan" | "revoked";
  appliedAt: Date;
}

export interface ApiKeyInterface {
  userId: Types.ObjectId;
  label: string;
  description: string;
  prefix: string;
  hashedKey: string;
  ipAllowlist: string[];
  lastUsedAt: Date | null;
  status: ApiKeyStatusInterface;
  liveAgentSetting: LiveAgentSetting;
  leadCaptureSetting: LeadCaptureSettingsInterface;
  whatsAppSetting: WhatsAppSetting;
  /** Hybrid / re-ranked retrieval over the knowledge base */
  enhancedRetrieval: boolean;
}
