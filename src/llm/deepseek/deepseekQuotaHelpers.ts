import type { DeepseekPeriodUsage } from "../../models/userPlanPeriod/userPlanPeriod.interface";

export function usedInWindow(
  usage: DeepseekPeriodUsage | null | undefined,
  windowIndex: number,
): number {
  if (!usage) return 0;
  if (usage.windowIndex !== windowIndex) return 0;
  const used = usage.totalTokens;
  if (typeof used !== "number" || !Number.isFinite(used) || used <= 0) return 0;
  return Math.trunc(used);
}

export function canUseDeepseek(opts: {
  apiKey: string;
  quota: number;
  used: number;
}): boolean {
  return opts.apiKey.length > 0 && opts.quota > 0 && opts.used < opts.quota;
}
