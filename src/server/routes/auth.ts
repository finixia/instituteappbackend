import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../utils/httpError";
import { UserModel, type UserRole } from "../models/user";
import { hashPassword, verifyPassword } from "../utils/password";
import { signAccessToken } from "../utils/jwt";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const authRouter = Router();

const RegisterAdminSchema = z.object({
  inviteCode: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

authRouter.post(
  "/admin/register",
  asyncHandler(async (req, res) => {
    const body = RegisterAdminSchema.parse(req.body);
    if (body.inviteCode !== env.ADMIN_INVITE_CODE) {
      throw new HttpError(403, "INVITE_INVALID", "Invalid invite code");
    }

    const exists = await UserModel.findOne({ email: body.email.toLowerCase() }).lean();
    if (exists) throw new HttpError(409, "EMAIL_TAKEN", "Email already registered");

    const passwordHash = await hashPassword(body.password);
    const user = await UserModel.create({ email: body.email, passwordHash, role: "ADMIN" satisfies UserRole });

    const token = signAccessToken({ sub: String(user._id), role: user.role });
    res.json({ ok: true, token, user: { id: String(user._id), email: user.email, role: user.role } });
  })
);

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const user = await UserModel.findOne({ email: body.email.toLowerCase() });
    if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");

    const token = signAccessToken({ sub: String(user._id), role: user.role });
    res.json({ ok: true, token, user: { id: String(user._id), email: user.email, role: user.role } });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, user: req.user });
  })
);

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "TEACHER", "PARENT"]),
  linkedStudentIds: z.array(z.string().min(1)).optional()
});

authRouter.post(
  "/users",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = CreateUserSchema.parse(req.body);
    const exists = await UserModel.findOne({ email: body.email.toLowerCase() }).lean();
    if (exists) throw new HttpError(409, "EMAIL_TAKEN", "Email already registered");

    const passwordHash = await hashPassword(body.password);
    const user = await UserModel.create({
      email: body.email,
      passwordHash,
      role: body.role,
      linkedStudentIds: body.role === "PARENT" ? body.linkedStudentIds ?? [] : []
    });

    res.status(201).json({ ok: true, user: { id: String(user._id), email: user.email, role: user.role } });
  })
);
