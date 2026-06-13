"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const health_1 = require("./routes/health");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./routes/auth");
const students_1 = require("./routes/students");
const attendance_1 = require("./routes/attendance");
const exams_1 = require("./routes/exams");
const fees_1 = require("./routes/fees");
const parent_1 = require("./routes/parent");
const settings_1 = require("./routes/settings");
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({ origin: true, credentials: true }));
    app.use(express_1.default.json({ limit: "2mb" }));
    app.get("/", (_req, res) => res.json({ ok: true, service: "institute-api" }));
    app.use("/health", health_1.healthRouter);
    app.use("/auth", auth_1.authRouter);
    app.use("/students", students_1.studentsRouter);
    app.use("/attendance", attendance_1.attendanceRouter);
    app.use("/exams", exams_1.examsRouter);
    app.use("/fees", fees_1.feesRouter);
    app.use("/parent", parent_1.parentRouter);
    app.use("/settings", settings_1.settingsRouter);
    app.use(errorHandler_1.errorHandler);
    return app;
}
