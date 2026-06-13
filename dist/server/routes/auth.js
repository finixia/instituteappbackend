"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const asyncHandler_1 = require("../middleware/asyncHandler");
const httpError_1 = require("../utils/httpError");
const user_1 = require("../models/user");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
exports.authRouter = (0, express_1.Router)();
function normalizePhone(phone) {
    return phone.replace(/\D/g, "");
}
const RegisterAdminSchema = zod_1.z.object({
    inviteCode: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8)
});
exports.authRouter.post("/admin/register", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = RegisterAdminSchema.parse(req.body);
    if (body.inviteCode !== env_1.env.ADMIN_INVITE_CODE) {
        throw new httpError_1.HttpError(403, "INVITE_INVALID", "Invalid invite code.");
    }
    const exists = await user_1.UserModel.findOne({ email: body.email.toLowerCase() }).lean();
    if (exists)
        throw new httpError_1.HttpError(409, "EMAIL_TAKEN", "Email is already registered.", { email: body.email?.toLowerCase() });
    const passwordHash = await (0, password_1.hashPassword)(body.password);
    const user = await user_1.UserModel.create({ email: body.email, passwordHash, role: "ADMIN" });
    const token = (0, jwt_1.signAccessToken)({ sub: String(user._id), role: user.role });
    res.json({ ok: true, token, user: { id: String(user._id), email: user.email, role: user.role } });
}));
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().min(6).optional(),
    password: zod_1.z.string().min(1)
}).refine((body) => body.email || body.phone, { message: "Email or phone is required" });
exports.authRouter.post("/login", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const user = body.phone
        ? await user_1.UserModel.findOne({ phone: normalizePhone(body.phone) })
        : await user_1.UserModel.findOne({ email: body.email?.toLowerCase() });
    if (!user)
        throw new httpError_1.HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    const ok = await (0, password_1.verifyPassword)(body.password, user.passwordHash);
    if (!ok)
        throw new httpError_1.HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    const token = (0, jwt_1.signAccessToken)({ sub: String(user._id), role: user.role });
    res.json({ ok: true, token, user: { id: String(user._id), email: user.email, phone: user.phone, role: user.role } });
}));
exports.authRouter.get("/me", requireAuth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    res.json({ ok: true, user: req.user });
}));
const CreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().min(6).optional(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.enum(["ADMIN", "TEACHER", "PARENT"]),
    linkedStudentIds: zod_1.z.array(zod_1.z.string().min(1)).optional()
});
exports.authRouter.post("/users", requireAuth_1.requireAuth, (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = CreateUserSchema.parse(req.body);
    if (body.role === "PARENT" && !body.phone) {
        throw new httpError_1.HttpError(400, "PHONE_REQUIRED", "Phone number is required for parent login.");
    }
    if (body.role !== "PARENT" && !body.email) {
        throw new httpError_1.HttpError(400, "EMAIL_REQUIRED", "Email is required for this role.");
    }
    const phone = body.phone ? normalizePhone(body.phone) : undefined;
    if (body.email) {
        const exists = await user_1.UserModel.findOne({ email: body.email.toLowerCase() }).lean();
        if (exists)
            throw new httpError_1.HttpError(409, "EMAIL_TAKEN", "Email is already registered.", { email: body.email?.toLowerCase() });
    }
    if (phone) {
        const exists = await user_1.UserModel.findOne({ phone }).lean();
        if (exists)
            throw new httpError_1.HttpError(409, "PHONE_TAKEN", "Phone is already registered.", { phone });
    }
    const passwordHash = await (0, password_1.hashPassword)(body.password);
    const user = await user_1.UserModel.create({
        email: body.email ?? (phone ? `${phone}@parent.local` : undefined),
        phone,
        passwordHash,
        role: body.role,
        linkedStudentIds: body.role === "PARENT" ? body.linkedStudentIds ?? [] : []
    });
    res.status(201).json({ ok: true, user: { id: String(user._id), email: user.email, phone: user.phone, role: user.role } });
}));
const UpdateUserCredentialsSchema = zod_1.z.object({
    phone: zod_1.z.string().min(6).optional(),
    password: zod_1.z.string().min(8).optional()
}).refine((body) => body.phone || body.password, { message: "Phone or password is required" });
exports.authRouter.patch("/users/:id/credentials", requireAuth_1.requireAuth, (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = UpdateUserCredentialsSchema.parse(req.body);
    const user = await user_1.UserModel.findById(req.params.id);
    if (!user)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "User not found.", { id: req.params.id });
    if (user.role !== "PARENT") {
        throw new httpError_1.HttpError(400, "INVALID_ROLE", "Only parent credentials can be updated here.");
    }
    if (body.phone) {
        const phone = normalizePhone(body.phone);
        const exists = await user_1.UserModel.findOne({ phone, _id: { $ne: user._id } }).lean();
        if (exists)
            throw new httpError_1.HttpError(409, "PHONE_TAKEN", "Phone is already registered.", { phone });
        user.phone = phone;
        user.email = `${phone}@parent.local`;
    }
    if (body.password) {
        user.passwordHash = await (0, password_1.hashPassword)(body.password);
    }
    await user.save();
    res.json({ ok: true, user: { id: String(user._id), email: user.email, phone: user.phone, role: user.role } });
}));
