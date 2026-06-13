"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.examsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const asyncHandler_1 = require("../middleware/asyncHandler");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const exam_1 = require("../models/exam");
const examScore_1 = require("../models/examScore");
const student_1 = require("../models/student");
const user_1 = require("../models/user");
const notification_1 = require("../models/notification");
const httpError_1 = require("../utils/httpError");
exports.examsRouter = (0, express_1.Router)();
exports.examsRouter.use(requireAuth_1.requireAuth);
exports.examsRouter.get("/", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const filter = {};
    if (classLevel)
        filter.classLevel = classLevel;
    if (from || to)
        filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const exams = await exam_1.ExamModel.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ ok: true, exams });
}));
const CreateExamSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    classLevel: zod_1.z.union([zod_1.z.literal(6), zod_1.z.literal(7), zod_1.z.literal(8), zod_1.z.literal(9), zod_1.z.literal(10)]),
    subject: zod_1.z.string().min(1),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxMarks: zod_1.z.number().int().positive(),
    passingMarks: zod_1.z.number().int().min(0)
}).refine((body) => body.passingMarks <= body.maxMarks, {
    message: "Passing marks must be less than or equal to max marks",
    path: ["passingMarks"]
});
exports.examsRouter.post("/", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = CreateExamSchema.parse(req.body);
    const exam = await exam_1.ExamModel.create({ ...body, createdByUserId: req.user.id });
    res.status(201).json({ ok: true, exam });
}));
exports.examsRouter.get("/:examId", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const exam = await exam_1.ExamModel.findById(req.params.examId).lean();
    if (!exam)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Exam not found");
    res.json({ ok: true, exam });
}));
exports.examsRouter.get("/:examId/scores", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const exam = await exam_1.ExamModel.findById(req.params.examId).lean();
    if (!exam)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Exam not found");
    const scores = await examScore_1.ExamScoreModel.find({ examId: req.params.examId }).lean();
    res.json({ ok: true, scores });
}));
exports.examsRouter.get("/:examId/results", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const exam = await exam_1.ExamModel.findById(req.params.examId).lean();
    if (!exam)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Exam not found");
    const scores = await examScore_1.ExamScoreModel.find({ examId: req.params.examId }).lean();
    const students = await student_1.StudentModel.find({ _id: { $in: scores.map((score) => score.studentId) } }).lean();
    const studentsById = new Map(students.map((student) => [String(student._id), student]));
    const ranked = scores
        .map((score) => ({
        score,
        student: studentsById.get(String(score.studentId)) ?? null,
        percent: exam.maxMarks > 0 ? Math.round((score.isAbsent ? 0 : (score.marks / exam.maxMarks) * 100)) : 0
    }))
        .sort((a, b) => {
        if (a.score.isAbsent !== b.score.isAbsent)
            return a.score.isAbsent ? 1 : -1;
        return b.score.marks - a.score.marks;
    });
    let currentRank = 0;
    let previousMarks = null;
    let publishedRank = 0;
    const results = ranked.map((entry) => {
        publishedRank += 1;
        if (previousMarks === null || entry.score.marks !== previousMarks || entry.score.isAbsent) {
            currentRank = publishedRank;
        }
        previousMarks = entry.score.marks;
        return {
            rank: entry.score.isAbsent ? null : currentRank,
            student: entry.student,
            marks: entry.score.isAbsent ? null : entry.score.marks,
            isAbsent: entry.score.isAbsent,
            percent: entry.percent
        };
    });
    res.json({ ok: true, exam, published: Boolean(exam.publishedAt), results });
}));
const UpsertScoreSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    marks: zod_1.z.number().min(0),
    isAbsent: zod_1.z.boolean().optional().default(false)
});
exports.examsRouter.put("/:examId/scores", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = UpsertScoreSchema.parse(req.body);
    const exam = await exam_1.ExamModel.findById(req.params.examId).lean();
    if (!exam)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Exam not found");
    if (!body.isAbsent && body.marks > exam.maxMarks)
        throw new httpError_1.HttpError(400, "INVALID_MARKS", "Marks exceed maxMarks");
    const score = await examScore_1.ExamScoreModel.findOneAndUpdate({ examId: req.params.examId, studentId: body.studentId }, { ...body, updatedByUserId: req.user.id }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    res.json({ ok: true, score });
}));
exports.examsRouter.put("/:examId/publish", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const exam = await exam_1.ExamModel.findById(req.params.examId).lean();
    if (!exam)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Exam not found");
    const updated = await exam_1.ExamModel.findByIdAndUpdate(req.params.examId, { publishedAt: new Date() }, { new: true }).lean();
    // Notify parents: create DB notifications and attempt Expo push
    (async () => {
        try {
            const scores = await examScore_1.ExamScoreModel.find({ examId: req.params.examId }).lean();
            const studentIds = Array.from(new Set(scores.map((s) => String(s.studentId))));
            const parents = await user_1.UserModel.find({ role: "PARENT", linkedStudentIds: { $in: studentIds } }).lean();
            const notifications = parents.map((parent) => {
                const linked = Array.isArray(parent.linkedStudentIds) ? parent.linkedStudentIds.map(String) : [];
                const studentId = studentIds.find((id) => linked.includes(id)) ?? null;
                const score = scores.find((s) => String(s.studentId) === studentId);
                const passed = score && !score.isAbsent && typeof updated?.passingMarks === "number" ? score.marks >= updated.passingMarks : null;
                const status = score ? (score.isAbsent ? "Absent" : passed ? "Passed" : "Failed") : "Result available";
                const body = score
                    ? score.isAbsent
                        ? `Your child was marked absent for ${updated?.title ?? "this exam"}.`
                        : `Your child ${passed ? "passed" : "failed"} ${updated?.title ?? "this exam"} with ${score.marks}/${updated?.maxMarks}.`
                    : `Your child's results for ${updated?.title ?? "this exam"} are now available.`;
                return {
                    recipientUserId: parent._id,
                    title: `Results published: ${updated?.title ?? "Exam"}`,
                    body,
                    data: {
                        examId: String(updated?._id),
                        studentId,
                        status,
                        marks: score?.marks ?? null,
                        maxMarks: updated?.maxMarks ?? null,
                        passingMarks: updated?.passingMarks ?? null
                    },
                    type: "published_result"
                };
            });
            if (notifications.length > 0) {
                await notification_1.NotificationModel.insertMany(notifications);
                const seenPushTokens = new Set();
                let parentsWithoutPushToken = 0;
                let duplicatePushTokens = 0;
                const pushMessages = [];
                parents.forEach((parent, index) => {
                    const notification = notifications[index];
                    const token = String(parent.expoPushToken ?? "").trim();
                    if (!notification)
                        return;
                    if (!token) {
                        parentsWithoutPushToken += 1;
                        return;
                    }
                    if (seenPushTokens.has(token)) {
                        duplicatePushTokens += 1;
                        return;
                    }
                    seenPushTokens.add(token);
                    pushMessages.push({
                        to: token,
                        title: notification.title,
                        body: notification.body,
                        data: notification.data,
                        sound: "default",
                        priority: "high",
                        channelId: "default"
                    });
                });
                if (parentsWithoutPushToken > 0 || duplicatePushTokens > 0) {
                    console.log("Expo push publish summary", {
                        sent: pushMessages.length,
                        parentsWithoutPushToken,
                        duplicatePushTokens
                    });
                }
                if (pushMessages.length > 0) {
                    try {
                        const response = await fetch("https://exp.host/--/api/v2/push/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(pushMessages)
                        });
                        const result = await response.json().catch(() => null);
                        const tickets = Array.isArray(result)
                            ? result
                            : Array.isArray(result?.data)
                                ? result.data
                                : [];
                        console.log("Expo push send response", response.status, result);
                        if (!response.ok || tickets.some((item) => item.status === "error")) {
                            console.warn("Expo push send response error", response.status, result);
                        }
                    }
                    catch (e) {
                        console.warn("Failed to send Expo pushes on publish:", e);
                    }
                }
            }
        }
        catch (e) {
            console.warn("Failed to create/send notifications on publish:", e);
        }
    })();
    res.json({ ok: true, exam: updated });
}));
exports.examsRouter.get("/student/:studentId", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const scores = await examScore_1.ExamScoreModel.find({ studentId: req.params.studentId }).sort({ updatedAt: -1 }).lean();
    const examIds = scores.map((s) => s.examId);
    const exams = await exam_1.ExamModel.find({ _id: { $in: examIds } }).lean();
    const examsById = new Map(exams.map((e) => [String(e._id), e]));
    res.json({
        ok: true,
        results: scores.map((s) => ({ score: s, exam: examsById.get(String(s.examId)) }))
    });
}));
