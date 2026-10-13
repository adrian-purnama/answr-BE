import dns from "node:dns/promises";
import net from "node:net";
import { MAX_TOPIC_IMAGE_BYTES } from "../validation/topic";

/** Slightly above processed max so large sources can still compress down. */
export const MAX_REMOTE_IMAGE_DOWNLOAD_BYTES = MAX_TOPIC_IMAGE_BYTES + 1024 * 1024;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.slice("::ffff:".length);
    return isPrivateIpv4(v4);
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
  return false;
}

async function assertPublicResolvedHost(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("Image URL is not allowed");
  }
  if (net.isIP(hostname)) return;

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Failed to resolve image URL");
  }
  if (!records.length) {
    throw new Error("Failed to resolve image URL");
  }
  for (const record of records) {
    if (record.family === 4 && isPrivateIpv4(record.address)) {
      throw new Error("Image URL is not allowed");
    }
    if (record.family === 6 && isPrivateIpv6(record.address)) {
      throw new Error("Image URL is not allowed");
    }
  }
}

function parseImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Invalid image URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) image URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("Image URL is not allowed");
  }
  return url;
}

/**
 * SSRF-safe download of a remote image into a Buffer.
 */
export async function fetchRemoteImageBuffer(rawUrl: string): Promise<{
  buffer: Buffer;
  contentType?: string;
}> {
  let url = parseImageUrl(rawUrl);
  await assertPublicResolvedHost(url.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response: Response | null = null;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      response = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "SapAi-ImageIngest/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Failed to download image");
        }
        const next = new URL(location, url);
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          throw new Error("Only http(s) image URLs are allowed");
        }
        if (next.username || next.password) {
          throw new Error("Image URL is not allowed");
        }
        await assertPublicResolvedHost(next.hostname);
        url = next;
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      throw new Error("Failed to download image");
    }

    const contentType = response.headers.get("content-type") ?? undefined;
    if (
      contentType &&
      !contentType.toLowerCase().startsWith("image/") &&
      !contentType.toLowerCase().startsWith("application/octet-stream")
    ) {
      throw new Error("Only image uploads are allowed");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REMOTE_IMAGE_DOWNLOAD_BYTES) {
      throw new Error("Image must be 5MB or smaller");
    }

    if (!response.body) {
      throw new Error("Failed to download image");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_REMOTE_IMAGE_DOWNLOAD_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        throw new Error("Image must be 5MB or smaller");
      }
      chunks.push(value);
    }

    return {
      buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))),
      contentType: contentType?.split(";")[0]?.trim(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Image download timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
