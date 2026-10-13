import type { Request } from "express";

function stripMappedV4(ip: string): string {
  return ip.replace(/^::ffff:/i, "");
}

/**
 * Client IP from Express after `trust proxy`. Never read body/query IPs
 * or the raw X-Forwarded-For header (spoofable without hop stripping).
 */
export function clientIp(req: Request): string {
  return stripMappedV4(
    req.ip?.trim() || req.socket.remoteAddress?.trim() || "",
  );
}
