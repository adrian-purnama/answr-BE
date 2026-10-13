import { authenticateLiveAgent } from "./authenticate";
import { requireAuth } from "./requireAuth";

export const requireLiveAgent = requireAuth(
  authenticateLiveAgent,
  (req, agent) => {
    req.liveAgent = agent;
  },
  "Invalid token",
  "middleware/requireLiveAgent.ts",
);
