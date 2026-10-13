import type {
  CreateMcpDto,
  UpdateMcpDto,
  UpdateMcpToolDto,
} from "../dto/mcp.dto";
import {
  MCP_AUTH_TYPE_VALUES,
  MCP_TRANSPORT_VALUES,
  type McpAuthConfig,
  type McpAuthType,
  type McpAuthentication,
  type McpTransport,
} from "../models/mcp/mcp.interface";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";
import { Types } from "mongoose";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("name must be a non-empty string");
  }
  return value.trim();
}

function parseDescription(value: unknown, defaultValue = ""): string {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "string") {
    throw new Error("description must be a string");
  }
  return value.trim();
}

function parseServerUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("serverUrl must be a non-empty string");
  }
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("serverUrl must be an http or https URL");
    }
  } catch {
    throw new Error("serverUrl must be a valid URL");
  }
  return trimmed;
}

function parseTransport(value: unknown): McpTransport {
  if (value === undefined) return "streamable_http";
  if (
    typeof value !== "string" ||
    !(MCP_TRANSPORT_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `transport must be one of: ${MCP_TRANSPORT_VALUES.join(", ")}`,
    );
  }
  return value as McpTransport;
}

function parseStringRecord(
  value: unknown,
  field: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object of string values`);
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error(`${field}.${key} must be a string`);
    }
    out[key] = entry;
  }
  return out;
}

function parseStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${field}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function parseAuthType(value: unknown): McpAuthType {
  if (
    typeof value !== "string" ||
    !(MCP_AUTH_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `authentication.type must be one of: ${MCP_AUTH_TYPE_VALUES.join(", ")}`,
    );
  }
  return value as McpAuthType;
}

function optionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireString(value: unknown, field: string): string {
  const parsed = optionalString(value, field);
  if (!parsed) {
    throw new Error(`${field} is required`);
  }
  return parsed;
}

/** Full auth parse for create (secrets required when type needs them). */
export function parseAuthentication(
  value: unknown,
  options: { requireSecrets: boolean } = { requireSecrets: true },
): McpAuthentication {
  if (value === undefined || value === null) {
    return { type: "none", config: {} };
  }
  if (!isRecord(value)) {
    throw new Error("authentication must be an object");
  }
  const type = parseAuthType(value.type ?? "none");
  const configRaw = isRecord(value.config) ? value.config : {};

  switch (type) {
    case "none":
      return { type, config: {} };
    case "bearer": {
      const token = optionalString(configRaw.token, "authentication.config.token");
      if (options.requireSecrets && !token) {
        throw new Error("authentication.config.token is required for bearer");
      }
      const config: McpAuthConfig = {
        ...(token ? { token } : {}),
        headerName: optionalString(
          configRaw.headerName,
          "authentication.config.headerName",
        ),
      } as McpAuthConfig;
      return { type, config };
    }
    case "api_key": {
      const apiKey = optionalString(
        configRaw.apiKey,
        "authentication.config.apiKey",
      );
      if (options.requireSecrets && !apiKey) {
        throw new Error("authentication.config.apiKey is required for api_key");
      }
      return {
        type,
        config: {
          ...(apiKey ? { apiKey } : {}),
          headerName: optionalString(
            configRaw.headerName,
            "authentication.config.headerName",
          ),
          queryParam: optionalString(
            configRaw.queryParam,
            "authentication.config.queryParam",
          ),
        } as McpAuthConfig,
      };
    }
    case "basic": {
      const username = optionalString(
        configRaw.username,
        "authentication.config.username",
      );
      const password = optionalString(
        configRaw.password,
        "authentication.config.password",
      );
      if (options.requireSecrets && (!username || !password)) {
        throw new Error(
          "authentication.config.username and password are required for basic",
        );
      }
      return {
        type,
        config: {
          ...(username ? { username } : {}),
          ...(password ? { password } : {}),
        } as McpAuthConfig,
      };
    }
    case "oauth2": {
      const clientId = options.requireSecrets
        ? requireString(configRaw.clientId, "authentication.config.clientId")
        : optionalString(configRaw.clientId, "authentication.config.clientId");
      const tokenUrl = options.requireSecrets
        ? requireString(configRaw.tokenUrl, "authentication.config.tokenUrl")
        : optionalString(configRaw.tokenUrl, "authentication.config.tokenUrl");
      return {
        type,
        config: {
          ...(clientId ? { clientId } : {}),
          ...(tokenUrl ? { tokenUrl } : {}),
          clientSecret: optionalString(
            configRaw.clientSecret,
            "authentication.config.clientSecret",
          ),
          authorizeUrl: optionalString(
            configRaw.authorizeUrl,
            "authentication.config.authorizeUrl",
          ),
          scopes: parseStringArray(
            configRaw.scopes,
            "authentication.config.scopes",
          ),
          accessToken: optionalString(
            configRaw.accessToken,
            "authentication.config.accessToken",
          ),
          refreshToken: optionalString(
            configRaw.refreshToken,
            "authentication.config.refreshToken",
          ),
          extraHeaders: parseStringRecord(
            configRaw.extraHeaders,
            "authentication.config.extraHeaders",
          ),
        } as McpAuthConfig,
      };
    }
    case "custom":
      return {
        type,
        config: {
          headers: parseStringRecord(
            configRaw.headers,
            "authentication.config.headers",
          ),
          query: parseStringRecord(
            configRaw.query,
            "authentication.config.query",
          ),
        },
      };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported authentication type: ${_exhaustive}`);
    }
  }
}

export function parseCreateMcpDto(body: unknown): CreateMcpDto {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }
  const authentication = parseAuthentication(body.authentication, {
    requireSecrets: true,
  });
  return {
    apiKeyId: parseApiKeyId(body.apiKeyId).toString(),
    name: parseName(body.name),
    description: parseDescription(body.description ?? ""),
    serverUrl: parseServerUrl(body.serverUrl),
    transport: parseTransport(body.transport),
    authentication: {
      type: authentication.type,
      config: authentication.config as Record<string, unknown>,
    },
  };
}

export function parseUpdateMcpDto(body: unknown): UpdateMcpDto {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }
  const patch: UpdateMcpDto = {};

  if ("name" in body) patch.name = parseName(body.name);
  if ("description" in body) {
    patch.description = parseDescription(body.description);
  }
  if ("serverUrl" in body) patch.serverUrl = parseServerUrl(body.serverUrl);
  if ("transport" in body) patch.transport = parseTransport(body.transport);
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    patch.enabled = body.enabled;
  }
  if ("authentication" in body) {
    const authentication = parseAuthentication(body.authentication, {
      requireSecrets: false,
    });
    patch.authentication = {
      type: authentication.type,
      config: authentication.config as Record<string, unknown>,
    };
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }
  return patch;
}

export function parseUpdateMcpToolDto(body: unknown): UpdateMcpToolDto {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }
  const patch: UpdateMcpToolDto = {};

  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    patch.enabled = body.enabled;
  }

  if ("render" in body) {
    if (
      body.render !== "off" &&
      body.render !== "deterministic" &&
      body.render !== "auto"
    ) {
      throw new Error('render must be "off", "deterministic", or "auto"');
    }
    patch.render = body.render;
  }

  if ("uiTemplateId" in body) {
    if (body.uiTemplateId === null || body.uiTemplateId === "") {
      patch.uiTemplateId = null;
    } else if (typeof body.uiTemplateId === "string") {
      if (!Types.ObjectId.isValid(body.uiTemplateId)) {
        throw new Error("uiTemplateId must be a valid id");
      }
      patch.uiTemplateId = body.uiTemplateId;
    } else {
      throw new Error("uiTemplateId must be a string or null");
    }
  }

  if ("fieldMap" in body) {
    if (!isRecord(body.fieldMap)) {
      throw new Error("fieldMap must be an object");
    }
    const fieldMap: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.fieldMap)) {
      if (typeof key !== "string" || !key.trim()) {
        throw new Error("fieldMap keys must be non-empty strings");
      }
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("fieldMap values must be non-empty path strings");
      }
      fieldMap[key.trim()] = value.trim();
    }
    patch.fieldMap = fieldMap;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  if (patch.render === "deterministic") {
    const templateId =
      patch.uiTemplateId !== undefined
        ? patch.uiTemplateId
        : undefined;
    if (templateId === null) {
      throw new Error("uiTemplateId is required when render is deterministic");
    }
  }

  return patch;
}

export function parseMcpRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "MCP id", objectId: true });
}

export function parseMcpToolRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "MCP tool id", objectId: true });
}
