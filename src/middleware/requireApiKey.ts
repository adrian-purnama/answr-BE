import { authenticateByApiKey } from "./authenticateApiKey";
import { requireAuth } from "./requireAuth";

export const requireApiKey = requireAuth(
  authenticateByApiKey,
  (req, auth) => {
    req.apiKeyAuth = auth;
  },
  "Invalid API key",
  "middleware/requireApiKey.ts",
);
