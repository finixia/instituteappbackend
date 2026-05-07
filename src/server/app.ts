import cors from "cors";
import express from "express";
import helmet from "helmet";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { studentsRouter } from "./routes/students";
import { attendanceRouter } from "./routes/attendance";
import { examsRouter } from "./routes/exams";
import { feesRouter } from "./routes/fees";
import { parentRouter } from "./routes/parent";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => res.json({ ok: true, service: "institute-api" }));
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/students", studentsRouter);
  app.use("/attendance", attendanceRouter);
  app.use("/exams", examsRouter);
  app.use("/fees", feesRouter);
  app.use("/parent", parentRouter);

  app.use(errorHandler);
  return app;
}
