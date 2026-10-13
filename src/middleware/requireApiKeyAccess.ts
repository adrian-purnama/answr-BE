import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../dto/apiResponse.dto";
import type {
  ApiKeyPermission,
  CollaboratorPermissions,
} from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";
import { ownerCollaboratorPermissions } from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";
import { ApiKeyModel } from "../models/apiKey/apiKey.model";
import { apiKeyCollaboratorService } from "../modules/apiKeyCollaborator/apiKeyCollaborator.service";
import { parseApiKeyId } from "../validation/apiKey";

export type ApiKeyAccessRole = "owner" | "collaborator";

export type ApiKeyAccess = {
  apiKey: {
    id: string;
    userId: Types.ObjectId;
    label: string;
  };
  role: ApiKeyAccessRole;
  permissions: CollaboratorPermissions;
};

export type ApiKeyIdResolver = (
  req: Request,
) => Types.ObjectId | Promise<Types.ObjectId>;

type ApiKeySummary = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  label: string;
};

export function resolveApiKeyIdFromRequest(req: Request): Types.ObjectId {
  const fromParams = req.params.apiKeyId;
  if (typeof fromParams === "string" && fromParams) {
    return parseApiKeyId(fromParams);
  }
  if (req.query.apiKeyId !== undefined) {
    return parseApiKeyId(req.query.apiKeyId);
  }
  const body = req.body as { apiKeyId?: unknown } | undefined;
  if (body && body.apiKeyId !== undefined) {
    return parseApiKeyId(body.apiKeyId);
  }
  return parseApiKeyId(undefined);
}

export function getApiKeyScope(req: Request): {
  actorId: Types.ObjectId;
  ownerId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
} {
  if (!req.user || !req.apiKeyAccess) {
    throw new Error("Authentication required");
  }
  return {
    actorId: req.user._id,
    ownerId: req.apiKeyAccess.apiKey.userId,
    apiKeyId: new Types.ObjectId(req.apiKeyAccess.apiKey.id),
  };
}

export function apiKeyIdFromParam(name: string): ApiKeyIdResolver {
  return (req) => parseApiKeyId(req.params[name]);
}

export function hasApiKeyPermission(
  access: ApiKeyAccess,
  permission: ApiKeyPermission,
): boolean {
  if (access.role === "owner") return true;

  switch (permission) {
    case "overview":
      return access.permissions.overview;
    case "performance":
      return access.permissions.performance;
    case "gaps":
      return access.permissions.gaps;
    case "train.articleSnippet":
      return access.permissions.train.articleSnippet;
    case "train.guidance":
      return access.permissions.train.guidance;
    case "test":
      return access.permissions.test;
    case "tools.liveAgent":
      return access.permissions.tools.liveAgent;
    case "tools.meeting":
      return access.permissions.tools.meeting;
    case "tools.mcp":
      return access.permissions.tools.mcp;
    case "tools.leadCapture":
      return access.permissions.tools.leadCapture;
    case "tools.whatsApp":
      return access.permissions.tools.whatsApp;
    case "widget":
      return access.permissions.widget;
  }
}

export async function loadApiKeyAccess(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
): Promise<ApiKeyAccess> {
  const apiKey = await ApiKeyModel.findById(apiKeyId)
    .select("userId label")
    .lean<ApiKeySummary | null>();
  if (!apiKey) {
    throw new Error("API key not found");
  }

  const summary = {
    id: apiKey._id.toString(),
    userId: apiKey.userId,
    label: apiKey.label,
  };

  if (apiKey.userId.equals(userId)) {
    return {
      apiKey: summary,
      role: "owner",
      permissions: ownerCollaboratorPermissions(),
    };
  }

  const collaborator = await apiKeyCollaboratorService.findByApiKeyAndUser(
    apiKeyId,
    userId,
  );
  if (!collaborator) {
    throw new Error("You do not have access to this API key");
  }

  return {
    apiKey: summary,
    role: "collaborator",
    permissions: collaborator.permissions,
  };
}

function json(
  res: Response,
  status: number,
  message: string,
): Response {
  return res.status(status).json({
    success: false,
    message,
    data: null,
  } satisfies ApiResponseDto);
}

async function attachApiKeyAccess(
  req: Request,
  resolve: ApiKeyIdResolver,
): Promise<ApiKeyAccess> {
  const apiKeyId = await resolve(req);
  if (req.apiKeyAccess && req.apiKeyAccess.apiKey.id === apiKeyId.toString()) {
    return req.apiKeyAccess;
  }
  if (!req.user) {
    throw new Error("Authentication required");
  }
  const access = await loadApiKeyAccess(req.user._id, apiKeyId);
  req.apiKeyAccess = access;
  return access;
}

export function requireApiKeyAccess(
  resolve: ApiKeyIdResolver = resolveApiKeyIdFromRequest,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return json(res, 401, "Authentication required");
    }
    try {
      await attachApiKeyAccess(req, resolve);
      next();
    } catch (error) {
      return sendAccessError(res, error);
    }
  };
}

function sendAccessError(res: Response, error: unknown): Response {
  const message =
    error instanceof Error ? error.message : "Failed to authorize API key";
  if (message === "API key not found") {
    return json(res, 404, message);
  }
  if (message === "You do not have access to this API key") {
    return json(res, 403, message);
  }
  return json(res, 400, message);
}

export function requireApiKeyPermission(
  permission: ApiKeyPermission,
  resolve: ApiKeyIdResolver = resolveApiKeyIdFromRequest,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return json(res, 401, "Authentication required");
    }
    try {
      const access = await attachApiKeyAccess(req, resolve);
      if (!hasApiKeyPermission(access, permission)) {
        return json(
          res,
          403,
          "You do not have permission to perform this action",
        );
      }
      next();
    } catch (error) {
      return sendAccessError(res, error);
    }
  };
}

export function requireAnyApiKeyPermission(
  permissions: readonly ApiKeyPermission[],
  resolve: ApiKeyIdResolver = resolveApiKeyIdFromRequest,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return json(res, 401, "Authentication required");
    }
    try {
      const access = await attachApiKeyAccess(req, resolve);
      if (!permissions.some((permission) => hasApiKeyPermission(access, permission))) {
        return json(
          res,
          403,
          "You do not have permission to perform this action",
        );
      }
      next();
    } catch (error) {
      return sendAccessError(res, error);
    }
  };
}

export function requireApiKeyOwner(
  resolve: ApiKeyIdResolver = apiKeyIdFromParam("id"),
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return json(res, 401, "Authentication required");
    }
    try {
      const access = await attachApiKeyAccess(req, resolve);
      if (access.role !== "owner") {
        return json(
          res,
          403,
          "You do not have permission to perform this action",
        );
      }
      next();
    } catch (error) {
      return sendAccessError(res, error);
    }
  };
}
