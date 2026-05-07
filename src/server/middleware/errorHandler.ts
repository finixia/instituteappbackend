import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
  }

  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  return res.status(500).json({ ok: false, error: { code: "INTERNAL", message: "Internal Server Error" } });
}

