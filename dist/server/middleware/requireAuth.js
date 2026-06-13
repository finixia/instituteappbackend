"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const httpError_1 = require("../utils/httpError");
const jwt_1 = require("../utils/jwt");
const user_1 = require("../models/user");
async function requireAuth(req, _res, next) {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
    if (!token)
        return next(new httpError_1.HttpError(401, "UNAUTHORIZED", "Missing bearer token"));
    const payload = (0, jwt_1.verifyAccessToken)(token);
    if (!payload)
        return next(new httpError_1.HttpError(401, "UNAUTHORIZED", "Invalid token"));
    const user = await user_1.UserModel.findById(payload.sub).lean();
    if (!user)
        return next(new httpError_1.HttpError(401, "UNAUTHORIZED", "User not found"));
    req.user = {
        id: String(user._id),
        role: user.role,
        email: user.email,
        phone: user.phone,
        linkedStudentIds: (user.linkedStudentIds ?? []).map((id) => String(id))
    };
    return next();
}
