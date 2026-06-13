"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_rekognition_1 = require("@aws-sdk/client-rekognition");
const attendance_1 = require("../models/attendance");
const asyncHandler_1 = require("../middleware/asyncHandler");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const student_1 = require("../models/student");
const env_1 = require("../../config/env");
exports.attendanceRouter = (0, express_1.Router)();
exports.attendanceRouter.use(requireAuth_1.requireAuth);
exports.attendanceRouter.get("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
    const date = req.query.date ? String(req.query.date) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const filter = {};
    if (studentId)
        filter.studentId = studentId;
    if (date)
        filter.date = date;
    if (startDate || endDate)
        filter.date = { ...(startDate ? { $gte: startDate } : {}), ...(endDate ? { $lte: endDate } : {}) };
    if (subject)
        filter.subject = subject;
    const records = await attendance_1.AttendanceModel.find(filter).sort({ date: -1 }).lean();
    res.json({ ok: true, attendance: records });
}));
exports.attendanceRouter.get("/session", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const date = req.query.date ? String(req.query.date) : undefined;
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const isActive = req.query.isActive ? String(req.query.isActive) === "true" : true;
    const studentFilter = {};
    if (classLevel)
        studentFilter.classLevel = classLevel;
    if (typeof isActive === "boolean")
        studentFilter.isActive = isActive;
    if (subject)
        studentFilter.subjects = subject;
    const students = await student_1.StudentModel.find(studentFilter).sort({ classLevel: 1, firstName: 1, lastName: 1 }).lean();
    const studentIds = students.map((student) => student._id);
    const attendanceFilter = { studentId: { $in: studentIds } };
    if (date)
        attendanceFilter.date = date;
    if (subject)
        attendanceFilter.subject = subject;
    const records = await attendance_1.AttendanceModel.find(attendanceFilter).lean();
    res.json({ ok: true, students, records });
}));
exports.attendanceRouter.get("/history", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const studentFilter = {};
    if (classLevel)
        studentFilter.classLevel = classLevel;
    if (subject)
        studentFilter.subjects = subject;
    const students = await student_1.StudentModel.find(studentFilter).lean();
    const studentsById = new Map(students.map((student) => [String(student._id), student]));
    const filter = { studentId: { $in: students.map((student) => student._id) } };
    if (from || to)
        filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (subject)
        filter.subject = subject;
    const records = await attendance_1.AttendanceModel.find(filter).sort({ date: -1, updatedAt: -1 }).limit(limit).lean();
    res.json({
        ok: true,
        records: records.map((record) => ({
            ...record,
            student: studentsById.get(String(record.studentId)) ?? null
        }))
    });
}));
const MarkSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    subject: zod_1.z.string().trim().min(1),
    mode: zod_1.z.enum(["ONLINE", "OFFLINE"]),
    status: zod_1.z.enum(["PRESENT", "ABSENT"])
});
exports.attendanceRouter.post("/mark", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = MarkSchema.parse(req.body);
    const doc = await attendance_1.AttendanceModel.findOneAndUpdate({ studentId: body.studentId, date: body.date, subject: body.subject }, { ...body, subject: body.subject.trim(), markedByUserId: req.user.id }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    res.json({ ok: true, attendance: doc });
}));
const RecognizeSchema = zod_1.z.object({
    imageBase64: zod_1.z.string().min(200),
    classLevel: zod_1.z.number().int().optional(),
    subject: zod_1.z.string().trim().min(1).optional()
});
exports.attendanceRouter.post("/recognize", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = RecognizeSchema.parse(req.body);
    if (!env_1.env.AWS_REGION || !env_1.env.AWS_REKOGNITION_COLLECTION_ID) {
        throw new Error("AWS Rekognition is not configured. Set AWS_REGION and AWS_REKOGNITION_COLLECTION_ID.");
    }
    const base64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");
    const client = new client_rekognition_1.RekognitionClient({ region: env_1.env.AWS_REGION });
    const command = new client_rekognition_1.SearchFacesByImageCommand({
        CollectionId: env_1.env.AWS_REKOGNITION_COLLECTION_ID,
        Image: { Bytes: imageBuffer },
        FaceMatchThreshold: 85,
        MaxFaces: 1
    });
    const result = await client.send(command);
    const faceMatch = result.FaceMatches?.[0];
    if (!faceMatch?.Face?.ExternalImageId) {
        return res.json({ ok: true, match: null, message: "No enrolled student face recognized for this class." });
    }
    const studentId = String(faceMatch.Face.ExternalImageId);
    const student = await student_1.StudentModel.findById(studentId).lean();
    if (!student) {
        return res.json({ ok: true, match: null, message: "Face was recognized but the student is not registered in the institute." });
    }
    if (body.classLevel && student.classLevel !== body.classLevel) {
        return res.json({
            ok: true,
            match: null,
            message: `Recognized student is in Class ${student.classLevel}, not Class ${body.classLevel}.`
        });
    }
    if (body.subject && !(student.subjects ?? []).includes(body.subject)) {
        return res.json({
            ok: true,
            match: null,
            message: `Recognized student is not enrolled for ${body.subject}.`
        });
    }
    return res.json({
        ok: true,
        match: {
            studentId: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            classLevel: student.classLevel,
            confidence: faceMatch.Similarity ?? 0
        }
    });
}));
exports.attendanceRouter.get("/student/:studentId", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const filter = { studentId: req.params.studentId };
    if (from || to)
        filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (subject)
        filter.subject = subject;
    const records = await attendance_1.AttendanceModel.find(filter).sort({ date: -1 }).lean();
    res.json({ ok: true, records });
}));
