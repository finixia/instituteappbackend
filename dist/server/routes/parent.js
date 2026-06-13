"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentRouter = void 0;
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const student_1 = require("../models/student");
const feeAccount_1 = require("../models/feeAccount");
const attendance_1 = require("../models/attendance");
const examScore_1 = require("../models/examScore");
const exam_1 = require("../models/exam");
const notification_1 = require("../models/notification");
const user_1 = require("../models/user");
const httpError_1 = require("../utils/httpError");
exports.parentRouter = (0, express_1.Router)();
exports.parentRouter.use(requireAuth_1.requireAuth);
exports.parentRouter.use((0, requireRole_1.requireRole)("PARENT"));
exports.parentRouter.get("/students", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const ids = req.user.linkedStudentIds ?? [];
    const students = await student_1.StudentModel.find({ _id: { $in: ids } }).lean();
    res.json({ ok: true, students });
}));
exports.parentRouter.get("/students/:studentId/results/:examId", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = req.params.studentId;
    const ids = new Set(req.user.linkedStudentIds ?? []);
    if (!ids.has(studentId))
        throw new httpError_1.HttpError(403, "FORBIDDEN", "Not linked");
    const exam = await exam_1.ExamModel.findById(req.params.examId).lean();
    if (!exam || !exam.publishedAt)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Published exam not found");
    const scores = await examScore_1.ExamScoreModel.find({ examId: req.params.examId }).lean();
    const studentScores = await student_1.StudentModel.find({ _id: { $in: scores.map((score) => score.studentId) } }).lean();
    const studentById = new Map(studentScores.map((student) => [String(student._id), student]));
    const ranked = scores
        .map((score) => ({
        score,
        student: studentById.get(String(score.studentId)) ?? null,
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
    const studentScore = results.find((result) => String(result.student?._id) === studentId) || null;
    res.json({ ok: true, exam, results, studentScore });
}));
exports.parentRouter.get("/students/:studentId/subject-report", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = req.params.studentId;
    const ids = new Set(req.user.linkedStudentIds ?? []);
    if (!ids.has(studentId))
        throw new httpError_1.HttpError(403, "FORBIDDEN", "Not linked");
    const [student, scores] = await Promise.all([
        student_1.StudentModel.findById(studentId).lean(),
        examScore_1.ExamScoreModel.find({ studentId }).sort({ updatedAt: -1 }).lean()
    ]);
    const exams = await exam_1.ExamModel.find({ _id: { $in: scores.map((score) => score.examId) } }).lean();
    const examsById = new Map(exams.map((exam) => [String(exam._id), exam]));
    const subjectMap = new Map();
    for (const score of scores) {
        const exam = examsById.get(String(score.examId));
        if (!exam)
            continue;
        const subject = exam.subject?.trim() || "General";
        const percent = !score.isAbsent && exam.maxMarks > 0 ? Math.round((score.marks / exam.maxMarks) * 100) : null;
        const existing = subjectMap.get(subject) ?? {
            subject,
            testsTaken: 0,
            totalMarks: 0,
            totalMaxMarks: 0,
            absentCount: 0,
            latestExamDate: null,
            recentTests: []
        };
        existing.testsTaken += 1;
        if (score.isAbsent) {
            existing.absentCount += 1;
        }
        else {
            existing.totalMarks += score.marks;
            existing.totalMaxMarks += exam.maxMarks;
        }
        if (!existing.latestExamDate || exam.date > existing.latestExamDate) {
            existing.latestExamDate = exam.date;
        }
        existing.recentTests.push({
            examId: String(exam._id),
            title: exam.title,
            date: exam.date,
            marks: score.isAbsent ? null : score.marks,
            maxMarks: exam.maxMarks,
            isAbsent: score.isAbsent,
            percent,
            publishedAt: exam.publishedAt ? exam.publishedAt.toISOString() : null
        });
        subjectMap.set(subject, existing);
    }
    const subjects = Array.from(subjectMap.values())
        .map((entry) => ({
        ...entry,
        averagePercent: entry.totalMaxMarks > 0 ? Math.round((entry.totalMarks / entry.totalMaxMarks) * 100) : null,
        recentTests: entry.recentTests.sort((a, b) => b.date.localeCompare(a.date))
    }))
        .sort((a, b) => {
        if ((b.averagePercent ?? -1) !== (a.averagePercent ?? -1)) {
            return (b.averagePercent ?? -1) - (a.averagePercent ?? -1);
        }
        return a.subject.localeCompare(b.subject);
    });
    const subjectsWithAverage = subjects.filter((subject) => subject.averagePercent !== null);
    res.json({
        ok: true,
        student,
        summary: {
            subjectsCount: subjects.length,
            testsCount: scores.length,
            averagePercent: subjectsWithAverage.length > 0
                ? Math.round(subjectsWithAverage.reduce((acc, subject) => acc + (subject.averagePercent ?? 0), 0) / subjectsWithAverage.length)
                : null
        },
        subjects
    });
}));
exports.parentRouter.get("/students/:studentId/overview", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = req.params.studentId;
    const ids = new Set(req.user.linkedStudentIds ?? []);
    if (!ids.has(studentId))
        throw new httpError_1.HttpError(403, "FORBIDDEN", "Not linked");
    const [student, feeAccount, latestAttendance, scores] = await Promise.all([
        student_1.StudentModel.findById(studentId).lean(),
        feeAccount_1.FeeAccountModel.findOne({ studentId }).lean(),
        attendance_1.AttendanceModel.find({ studentId }).sort({ date: -1 }).limit(30).lean(),
        examScore_1.ExamScoreModel.find({ studentId }).sort({ updatedAt: -1 }).limit(10).lean()
    ]);
    const exams = await exam_1.ExamModel.find({ _id: { $in: scores.map((s) => s.examId) } }).lean();
    const examsById = new Map(exams.map((e) => [String(e._id), e]));
    const publishedExamIds = exams.filter((exam) => exam.publishedAt).map((exam) => String(exam._id));
    const publishedResults = scores
        .filter((score) => publishedExamIds.includes(String(score.examId)))
        .map((score) => ({ score, exam: examsById.get(String(score.examId)) }));
    res.json({
        ok: true,
        student,
        feeAccount,
        attendance: latestAttendance,
        exams: scores.map((s) => ({ score: s, exam: examsById.get(String(s.examId)) })),
        publishedResults
    });
}));
exports.parentRouter.get("/exams", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const exams = await exam_1.ExamModel.find({ publishedAt: { $exists: true } }).sort({ publishedAt: -1 }).lean();
    res.json({ ok: true, exams });
}));
exports.parentRouter.post("/push-token", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const token = String(req.body.token ?? "").trim();
    if (!token)
        return res.status(400).json({ ok: false, error: { message: "Missing token" } });
    const parent = await user_1.UserModel.findByIdAndUpdate(req.user.id, { expoPushToken: token }, { new: true }).lean();
    if (!parent)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Parent user not found");
    console.log("Saved Expo push token for parent", parent._id, token);
    res.json({ ok: true, token });
}));
exports.parentRouter.get("/notifications", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const notifications = await notification_1.NotificationModel.find({ recipientUserId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, notifications });
}));
exports.parentRouter.get("/fees", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const ids = req.user.linkedStudentIds ?? [];
    const feeAccounts = await feeAccount_1.FeeAccountModel.find({ studentId: { $in: ids } }).populate('studentId', 'firstName lastName').populate('planId', 'name').lean();
    // Calculate totals for each fee account
    const accountsWithTotals = feeAccounts.map((account) => {
        const totalAmount = account.installments.reduce((sum, inst) => sum + inst.amount, 0);
        const paidAmount = account.installments.reduce((sum, inst) => sum + (inst.paidAmount ?? 0), 0);
        const dueAmount = totalAmount - paidAmount;
        return {
            ...account,
            totalAmount,
            paidAmount,
            dueAmount
        };
    });
    res.json({ ok: true, feeAccounts: accountsWithTotals });
}));
