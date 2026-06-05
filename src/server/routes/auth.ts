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

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

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
      throw new HttpError(403, "INVITE_INVALID", "Invalid invite code.");
    }

    const exists = await UserModel.findOne({ email: body.email.toLowerCase() }).lean();
    if (exists) throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered.", { email: body.email?.toLowerCase() });

    const passwordHash = await hashPassword(body.password);
    const user = await UserModel.create({ email: body.email, passwordHash, role: "ADMIN" satisfies UserRole });

    const token = signAccessToken({ sub: String(user._id), role: user.role });
    res.json({ ok: true, token, user: { id: String(user._id), email: user.email, role: user.role } });
  })
);

const LoginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(1)
}).refine((body) => body.email || body.phone, { message: "Email or phone is required" });

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const user = body.phone
      ? await UserModel.findOne({ phone: normalizePhone(body.phone) })
      : await UserModel.findOne({ email: body.email?.toLowerCase() });
    if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");

    const token = signAccessToken({ sub: String(user._id), role: user.role });
    res.json({ ok: true, token, user: { id: String(user._id), email: user.email, phone: user.phone, role: user.role } });
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
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
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
    if (body.role === "PARENT" && !body.phone) {
      throw new HttpError(400, "PHONE_REQUIRED", "Phone number is required for parent login.");
    }
    if (body.role !== "PARENT" && !body.email) {
      throw new HttpError(400, "EMAIL_REQUIRED", "Email is required for this role.");
    }

    const phone = body.phone ? normalizePhone(body.phone) : undefined;
    if (body.email) {
      const exists = await UserModel.findOne({ email: body.email.toLowerCase() }).lean();
      if (exists) throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered.", { email: body.email?.toLowerCase() });
    }
    if (phone) {
      const exists = await UserModel.findOne({ phone }).lean();
      if (exists) throw new HttpError(409, "PHONE_TAKEN", "Phone is already registered.", { phone });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await UserModel.create({
      email: body.email ?? (phone ? `${phone}@parent.local` : undefined),
      phone,
      passwordHash,
      role: body.role,
      linkedStudentIds: body.role === "PARENT" ? body.linkedStudentIds ?? [] : []
    });

    res.status(201).json({ ok: true, user: { id: String(user._id), email: user.email, phone: user.phone, role: user.role } });
  })
);

const UpdateUserCredentialsSchema = z.object({
  phone: z.string().min(6).optional(),
  password: z.string().min(8).optional()
}).refine((body) => body.phone || body.password, { message: "Phone or password is required" });

authRouter.patch(
  "/users/:id/credentials",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = UpdateUserCredentialsSchema.parse(req.body);
    const user = await UserModel.findById(req.params.id);
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found.", { id: req.params.id });
    if (user.role !== "PARENT") {
      throw new HttpError(400, "INVALID_ROLE", "Only parent credentials can be updated here.");
    }

    if (body.phone) {
      const phone = normalizePhone(body.phone);
      const exists = await UserModel.findOne({ phone, _id: { $ne: user._id } }).lean();
      if (exists) throw new HttpError(409, "PHONE_TAKEN", "Phone is already registered.", { phone });
      user.phone = phone;
      user.email = `${phone}@parent.local`;
    }
    if (body.password) {
      user.passwordHash = await hashPassword(body.password);
    }

    await user.save();
    res.json({ ok: true, user: { id: String(user._id), email: user.email, phone: user.phone, role: user.role } });
  })
);
