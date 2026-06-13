"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const mongodb_1 = require("mongodb");
const zod_1 = require("zod");
const httpError_1 = require("../utils/httpError");
function errorHandler(err, _req, res, _next) {
    if (err instanceof httpError_1.HttpError) {
        return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof zod_1.ZodError) {
        const message = err.issues.length > 0 ? err.issues[0].message : "Invalid request payload.";
        return res.status(400).json({ ok: false, error: { code: "INVALID_REQUEST", message, details: err.issues } });
    }
    if (err instanceof mongodb_1.MongoServerError && err.code === 11000) {
        const field = Object.keys(err.keyValue ?? {})[0];
        const message = field
            ? `A record with this ${field} already exists. Please choose a different ${field}.`
            : "A duplicate record already exists. Please choose a different value.";
        return res.status(409).json({ ok: false, error: { code: "DUPLICATE_KEY", message, details: err.keyValue } });
    }
    // eslint-disable-next-line no-console
    console.error("[api] unhandled error:", err);
    return res.status(500).json({ ok: false, error: { code: "INTERNAL", message: "Internal Server Error" } });
}
