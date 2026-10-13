import jwt from "jsonwebtoken";
import { env } from "../environment/env";

export type AccessTokenPayload = {
    userId: string;
    email: string;
    isAdmin: boolean;
};

export type LiveAgentTokenPayload = {
    agentId: string;
    apiKeyId: string;
    name: string;
    typ: "liveAgent";
};

export function signAccessToken(payload: {
    userId: string;
    email: string;
    isAdmin: boolean;
    rememberMe: boolean;
}): string {
    return jwt.sign(
        {
            userId: payload.userId,
            email: payload.email,
            isAdmin: payload.isAdmin,
        },
        env.jwtSecret,
        { expiresIn: payload.rememberMe ? "30d" : "1h" }
    );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (typeof decoded === "string" || !decoded || typeof decoded !== "object") {
        throw new Error("Invalid token");
    }

    if ((decoded as { typ?: unknown }).typ === "liveAgent") {
        throw new Error("Invalid token payload");
    }

    const { userId, email, isAdmin } = decoded as AccessTokenPayload;

    if (!userId || !email || typeof isAdmin !== "boolean") {
        throw new Error("Invalid token payload");
    }

    return { userId, email, isAdmin };
}

export function signLiveAgentToken(payload: {
    agentId: string;
    apiKeyId: string;
    name: string;
    rememberMe?: boolean;
}): string {
    return jwt.sign(
        {
            agentId: payload.agentId,
            apiKeyId: payload.apiKeyId,
            name: payload.name,
            typ: "liveAgent",
        } satisfies LiveAgentTokenPayload,
        env.jwtSecret,
        { expiresIn: payload.rememberMe ? "30d" : "1h" }
    );
}

export function verifyLiveAgentToken(token: string): LiveAgentTokenPayload {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (typeof decoded === "string" || !decoded || typeof decoded !== "object") {
        throw new Error("Invalid token");
    }

    const { agentId, apiKeyId, name, typ } = decoded as LiveAgentTokenPayload;

    if (!agentId || !apiKeyId || !name || typ !== "liveAgent") {
        throw new Error("Invalid token payload");
    }

    return { agentId, apiKeyId, name, typ };
}
