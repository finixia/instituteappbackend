"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_rekognition_1 = require("@aws-sdk/client-rekognition");
const asyncHandler_1 = require("../middleware/asyncHandler");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const student_1 = require("../models/student");
const user_1 = require("../models/user");
const httpError_1 = require("../utils/httpError");
const env_1 = require("../../config/env");
exports.studentsRouter = (0, express_1.Router)();
exports.studentsRouter.use(requireAuth_1.requireAuth);
async function withParentLoginSummary(students) {
    const studentIds = students.map((student) => String(student._id));
    const parentUsers = await user_1.UserModel.find({
        role: "PARENT",
        linkedStudentIds: { $in: studentIds }
    }).select("_id phone email linkedStudentIds").lean();
    const parentByStudentId = new Map();
    for (const user of parentUsers) {
        for (const studentId of user.linkedStudentIds ?? []) {
            const key = String(studentId);
            if (!parentByStudentId.has(key)) {
                parentByStudentId.set(key, { id: String(user._id), phone: user.phone, email: user.email });
            }
        }
    }
    return students.map((student) => ({
        ...student,
        parentLogin: parentByStudentId.get(String(student._id)) ?? null
    }));
}
const CreateStudentSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().optional(),
    classLevel: zod_1.z.union([zod_1.z.literal(6), zod_1.z.literal(7), zod_1.z.literal(8), zod_1.z.literal(9), zod_1.z.literal(10)]),
    subjects: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1),
    parentPhones: zod_1.z.array(zod_1.z.string().min(6)).min(1),
    admissionDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
exports.studentsRouter.post("/", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = CreateStudentSchema.parse(req.body);
    const student = await student_1.StudentModel.create({
        ...body,
        subjects: body.subjects.map((subject) => subject.trim()),
        admissionDate: new Date(body.admissionDate)
    });
    res.status(201).json({ ok: true, student });
}));
exports.studentsRouter.get("/", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const isActive = req.query.isActive ? String(req.query.isActive) === "true" : undefined;
    const q = req.query.q ? String(req.query.q).trim() : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const filter = {};
    if (classLevel)
        filter.classLevel = classLevel;
    if (typeof isActive === "boolean")
        filter.isActive = isActive;
    if (q)
        filter.firstName = { $regex: q, $options: "i" };
    if (subject)
        filter.subjects = subject;
    const students = await student_1.StudentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, students: await withParentLoginSummary(students) });
}));
exports.studentsRouter.get("/:id", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const student = await student_1.StudentModel.findById(req.params.id).lean();
    if (!student)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Student not found.", { id: req.params.id });
    const [studentWithLogin] = await withParentLoginSummary([student]);
    res.json({ ok: true, student: studentWithLogin });
}));
const UpdateStudentSchema = CreateStudentSchema.partial().extend({
    isActive: zod_1.z.boolean().optional()
});
exports.studentsRouter.patch("/:id", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const patch = UpdateStudentSchema.parse(req.body);
    const update = { ...patch };
    if (patch.admissionDate)
        update.admissionDate = new Date(patch.admissionDate);
    if (patch.subjects)
        update.subjects = patch.subjects.map((subject) => subject.trim());
    const student = await student_1.StudentModel.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!student)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Student not found.", { id: req.params.id });
    res.json({ ok: true, student });
}));
exports.studentsRouter.delete("/:id", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const student = await student_1.StudentModel.findByIdAndDelete(req.params.id).lean();
    if (!student)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Student not found.", { id: req.params.id });
    res.json({ ok: true });
}));
const EnrollFaceSchema = zod_1.z.object({
    imageBase64: zod_1.z.string().min(200)
});
exports.studentsRouter.post("/:id/enroll-face", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const student = await student_1.StudentModel.findById(req.params.id);
    if (!student)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Student not found.", { id: req.params.id });
    if (!env_1.env.AWS_REGION || !env_1.env.AWS_REKOGNITION_COLLECTION_ID) {
        throw new Error("AWS Rekognition is not configured. Set AWS_REGION and AWS_REKOGNITION_COLLECTION_ID.");
    }
    const body = EnrollFaceSchema.parse(req.body);
    const base64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");
    const client = new client_rekognition_1.RekognitionClient({ region: env_1.env.AWS_REGION });
    // Index the face in the collection
    const indexCommand = new client_rekognition_1.IndexFacesCommand({
        CollectionId: env_1.env.AWS_REKOGNITION_COLLECTION_ID,
        Image: { Bytes: imageBuffer },
        ExternalImageId: String(student._id),
        MaxFaces: 1,
        QualityFilter: "AUTO"
    });
    const indexResult = await client.send(indexCommand);
    const faceRecord = indexResult.FaceRecords?.[0];
    if (!faceRecord) {
        return res.status(400).json({
            ok: false,
            error: { code: "FACE_NOT_DETECTED", message: "No face detected in the provided image. Please try again with a clear face image." }
        });
    }
    res.json({
        ok: true,
        message: "Face enrolled successfully",
        faceId: faceRecord.Face?.FaceId
    });
}));
