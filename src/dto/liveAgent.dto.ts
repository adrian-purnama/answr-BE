export interface CreateLiveAgentDto {
  apiKeyId: string;
  name: string;
  password: string;
  enabled?: boolean;
}

export interface UpdateLiveAgentDto {
  name?: string;
  enabled?: boolean;
  profilePicture?: string;
}

export interface ResetLiveAgentPasswordDto {
  password: string;
}

export interface LiveAgentOutDto {
  id: string;
  apiKeyId: string;
  name: string;
  enabled: boolean;
  profilePicture: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiveAgentMediaOutDto {
  mediaId: string;
  url: string;
}

export interface LiveAgentLoginDto {
  name: string;
  password: string;
  code: string;
}

export interface LiveAgentLoginOutDto {
  name: string;
  jwt: string;
}

export type LiveAgentResilience = "low" | "medium" | "high" | "never";

export const LIVE_AGENT_RESILIENCE_VALUES = [
  "low",
  "medium",
  "high",
  "never",
] as const satisfies readonly LiveAgentResilience[];

export interface LiveAgentSettingsOutDto {
  enabled: boolean;
  code: string;
  resilience: LiveAgentResilience;
  notifyEmail: string;
}

export interface UpdateLiveAgentSettingsDto {
  enabled?: boolean;
  resilience?: LiveAgentResilience;
  notifyEmail?: string;
}

export interface LiveAgentMeOutDto {
  id: string;
  apiKeyId: string;
  name: string;
  enabled: boolean;
  profilePicture: string;
}
