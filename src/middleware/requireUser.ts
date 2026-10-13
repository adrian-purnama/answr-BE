import { authenticateByToken } from "./authenticate";
import { requireAuth } from "./requireAuth";

export const requireUser = requireAuth(
  authenticateByToken,
  (req, user) => {
    req.user = user;
  },
  "Invalid token",
  "middleware/requireUser.ts",
);
