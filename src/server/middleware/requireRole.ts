import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import type { UserRole } from "../models/user";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "UNAUTHORIZED", "Missing auth"));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "FORBIDDEN", "Insufficient role"));
    return next();
  };
}

