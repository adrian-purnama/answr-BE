export interface ResetTokenPayload {
    email: string;
    otp: string;
}

export function encodeResetToken(email: string, otp: string): string {
    return Buffer.from(JSON.stringify({ email, otp }), "utf8").toString("base64url");
}

export function decodeResetToken(token: string): ResetTokenPayload | null {
    try {
        const payload = JSON.parse(
            Buffer.from(token, "base64url").toString("utf8")
        ) as ResetTokenPayload;

        if (
            typeof payload.email !== "string" ||
            typeof payload.otp !== "string" ||
            !payload.email ||
            !payload.otp
        ) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}
