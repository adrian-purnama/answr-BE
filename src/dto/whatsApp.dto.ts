import type { WahaSessionStatus } from "../models/apiKey/apiKey.interface";

export interface WhatsAppSettingsOutDto {
  apiKeyId: string;
  enabled: boolean;
  defaultFlow: boolean;
  sessionName: string | null;
  status: WahaSessionStatus | null;
  meId: string | null;
  mePushName: string | null;
  lastSyncedAt: string | null;
}

export interface UpdateWhatsAppSettingsDto {
  enabled?: boolean;
  defaultFlow?: boolean;
}

export interface WhatsAppQrOutDto {
  imageBase64: string;
}
