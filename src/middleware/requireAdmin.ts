import { NextFunction, Request, Response } from "express";
import { ApiResponseDto } from "../dto/apiResponse.dto";




/**
 * Express middleware that restricts access to admin users only.
 *
 * **Must be used in conjunction with `requireUser`**    this middleware
 * does not verify JWTs itself; it only checks `req.user.isAdmin`.
 *
 * - Returns 401 if `req.user` is not set (i.e. `requireUser` was not run first)
 * - Returns 403 if the user is not an admin
 *
 * @example
 * router.delete("/users/:id", requireUser, requireAdmin, controller.deleteUser);
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      data: null,
    } satisfies ApiResponseDto);
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
      data: null,
    } satisfies ApiResponseDto);
  }

  next();
};