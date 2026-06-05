import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { verifyAccessToken } from "../utils/jwt";
import { UserModel } from "../models/user";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.header("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!token) return next(new HttpError(401, "UNAUTHORIZED", "Missing bearer token"));

  const payload = verifyAccessToken(token);
  if (!payload) return next(new HttpError(401, "UNAUTHORIZED", "Invalid token"));

  const user = await UserModel.findById(payload.sub).lean();
  if (!user) return next(new HttpError(401, "UNAUTHORIZED", "User not found"));

  req.user = {
    id: String(user._id),
    role: user.role,
    email: user.email,
    phone: user.phone,
    linkedStudentIds: (user.linkedStudentIds ?? []).map((id) => String(id))
  };
  return next();
}
