"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const httpError_1 = require("../utils/httpError");
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new httpError_1.HttpError(401, "UNAUTHORIZED", "Missing auth"));
        if (!roles.includes(req.user.role))
            return next(new httpError_1.HttpError(403, "FORBIDDEN", "Insufficient role"));
        return next();
    };
}
