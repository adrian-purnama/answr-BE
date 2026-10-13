import { HydratedDocument } from "mongoose";
import { UserInterface } from "../models/user/user.interface";
import { UserModel } from "../models/user/user.model";
import { LiveAgentModel } from "../models/liveAgent/liveAgent.model";
import type { LiveAgentInterface } from "../models/liveAgent/liveAgent.interface";
import { ApiKeyModel } from "../models/apiKey/apiKey.model";
import { entitlementService } from "../modules/entitlement/entitlement.service";
import { verifyAccessToken, verifyLiveAgentToken } from "../utils/jwt";

export class AuthError extends Error {
    constructor(
        message: string,
        readonly statusCode: 401 | 403 = 401
    ) {
        super(message);
    }
}

export async function authenticateByToken(
    token: string
): Promise<HydratedDocument<UserInterface>> {
    if (!token) {
        throw new AuthError("Missing or invalid authorization token");
    }

    try {
        const payload = verifyAccessToken(token);
        const user = await UserModel.findById(payload.userId);

        if (!user) {
            throw new AuthError("User not found");
        }

        if (user.isBlocked) {
            throw new AuthError("User is blocked", 403);
        }

        return user;
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }

        throw new AuthError("Invalid token");
    }
}

export async function authenticateLiveAgent(
    token: string
): Promise<HydratedDocument<LiveAgentInterface>> {
    if (!token) {
        throw new AuthError("Missing or invalid authorization token");
    }

    try {
        const payload = verifyLiveAgentToken(token);
        const agent = await LiveAgentModel.findById(payload.agentId);

        if (!agent) {
            throw new AuthError("Live agent not found");
        }

        if (!agent.enabled) {
            throw new AuthError("Live agent is disabled", 403);
        }

        const apiKey = await ApiKeyModel.findById(agent.apiKeyId).lean();
        if (!apiKey || apiKey.status.status !== "active") {
            throw new AuthError("Project is not active", 403);
        }
        if (!apiKey.liveAgentSetting?.enabled) {
            throw new AuthError("Live agent is disabled for this project", 403);
        }

        const planAllows = await entitlementService.hasLiveAgent(
            apiKey.userId,
            apiKey._id,
        );
        if (!planAllows) {
            throw new AuthError("Your plan does not include Live Agent", 403);
        }

        return agent;
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }

        throw new AuthError("Invalid token");
    }
}
