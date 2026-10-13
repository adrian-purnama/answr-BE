import {
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type {
  McpAuthApiKeyConfig,
  McpAuthBasicConfig,
  McpAuthBearerConfig,
  McpAuthCustomConfig,
  McpAuthOAuth2Config,
  McpAuthentication,
  McpTransport,
} from "../models/mcp/mcp.interface";

export type ListedMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function buildAuthRequest(
  authentication: McpAuthentication,
  serverUrl: string,
): { url: URL; requestInit: RequestInit; bearerToken?: string } {
  const url = new URL(serverUrl);
  const headers: Record<string, string> = {};
  let bearerToken: string | undefined;

  switch (authentication.type) {
    case "none":
      break;
    case "bearer": {
      const config = authentication.config as McpAuthBearerConfig;
      if (!config.token) {
        throw new Error("Bearer token is missing");
      }
      const headerName = config.headerName?.trim() || "Authorization";
      if (headerName.toLowerCase() === "authorization") {
        bearerToken = config.token;
        headers.Authorization = `Bearer ${config.token}`;
      } else {
        headers[headerName] = config.token;
      }
      break;
    }
    case "api_key": {
      const config = authentication.config as McpAuthApiKeyConfig;
      if (!config.apiKey) {
        throw new Error("API key is missing");
      }
      if (config.queryParam) {
        url.searchParams.set(config.queryParam, config.apiKey);
      } else {
        const headerName = config.headerName?.trim() || "X-API-Key";
        headers[headerName] = config.apiKey;
      }
      break;
    }
    case "basic": {
      const config = authentication.config as McpAuthBasicConfig;
      if (!config.username || !config.password) {
        throw new Error("Basic auth username/password is missing");
      }
      const encoded = Buffer.from(
        `${config.username}:${config.password}`,
        "utf8",
      ).toString("base64");
      headers.Authorization = `Basic ${encoded}`;
      break;
    }
    case "oauth2": {
      const config = authentication.config as McpAuthOAuth2Config;
      if (!config.accessToken) {
        throw new Error(
          "OAuth2 accessToken is required to sync (interactive OAuth is not supported yet)",
        );
      }
      bearerToken = config.accessToken;
      headers.Authorization = `Bearer ${config.accessToken}`;
      if (config.extraHeaders) {
        Object.assign(headers, config.extraHeaders);
      }
      break;
    }
    case "custom": {
      const config = authentication.config as McpAuthCustomConfig;
      if (config.headers) {
        Object.assign(headers, config.headers);
      }
      if (config.query) {
        for (const [key, value] of Object.entries(config.query)) {
          url.searchParams.set(key, value);
        }
      }
      break;
    }
    default: {
      const _exhaustive: never = authentication.type;
      throw new Error(`Unsupported authentication type: ${_exhaustive}`);
    }
  }

  return {
    url,
    requestInit: { headers },
    bearerToken,
  };
}

/**
 * Connect to an MCP server, run `fn`, then disconnect.
 * Uses Streamable HTTP by default; SSE when transport is "sse".
 */
async function withMcpClient<T>(
  input: {
    serverUrl: string;
    transport: McpTransport;
    authentication: McpAuthentication;
  },
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const { url, requestInit, bearerToken } = buildAuthRequest(
    input.authentication,
    input.serverUrl,
  );

  const transportOptions = {
    requestInit,
    ...(bearerToken
      ? {
          authProvider: {
            token: async () => bearerToken,
          },
        }
      : {}),
  };

  const client = new Client({ name: "sapai", version: "1.0.0" });
  const transport =
    input.transport === "sse"
      ? new SSEClientTransport(url, transportOptions)
      : new StreamableHTTPClientTransport(url, transportOptions);

  try {
    await client.connect(transport);
    return await fn(client);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to MCP server";
    throw new Error(`MCP connect failed: ${message}`);
  } finally {
    try {
      if (
        transport instanceof StreamableHTTPClientTransport &&
        typeof transport.terminateSession === "function"
      ) {
        await transport.terminateSession();
      }
    } catch {
      // ignore session terminate errors on teardown
    }
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}

/**
 * Connect to an MCP server, list tools, then disconnect.
 * Uses Streamable HTTP by default; SSE when transport is "sse".
 */
export async function listMcpServerTools(input: {
  serverUrl: string;
  transport: McpTransport;
  authentication: McpAuthentication;
}): Promise<ListedMcpTool[]> {
  return withMcpClient(input, async (client) => {
    const result = await client.listTools();
    return (result.tools ?? []).map((tool) => {
      const inputSchema =
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : {};
      const outputSchema =
        "outputSchema" in tool &&
        tool.outputSchema &&
        typeof tool.outputSchema === "object"
          ? (tool.outputSchema as Record<string, unknown>)
          : {};
      const annotations =
        tool.annotations && typeof tool.annotations === "object"
          ? (tool.annotations as Record<string, unknown>)
          : undefined;
      const titleFromTool =
        "title" in tool && typeof tool.title === "string" ? tool.title.trim() : "";
      const titleFromAnnotations =
        annotations && typeof annotations.title === "string"
          ? annotations.title.trim()
          : "";
      return {
        name: tool.name,
        title: titleFromTool || titleFromAnnotations || tool.name,
        description: tool.description ?? "",
        inputSchema,
        outputSchema,
        annotations,
        raw: tool as unknown as Record<string, unknown>,
      };
    });
  });
}

export type McpToolCallResult = {
  content: unknown;
  structuredContent: unknown;
  isError: boolean;
};

/** Connect, call one tool by name, disconnect. */
export async function callMcpTool(input: {
  serverUrl: string;
  transport: McpTransport;
  authentication: McpAuthentication;
  name: string;
  arguments?: Record<string, unknown>;
}): Promise<McpToolCallResult> {
  return withMcpClient(input, async (client) => {
    const result = await client.callTool({
      name: input.name,
      arguments: input.arguments ?? {},
    });
    const isError =
      result &&
      typeof result === "object" &&
      "isError" in result &&
      (result as { isError?: unknown }).isError === true;
    const content =
      result && typeof result === "object" && "content" in result
        ? (result as { content: unknown }).content
        : result;
    const structuredContent =
      result &&
      typeof result === "object" &&
      "structuredContent" in result
        ? (result as { structuredContent: unknown }).structuredContent
        : undefined;
    return { content, structuredContent, isError };
  });
}
