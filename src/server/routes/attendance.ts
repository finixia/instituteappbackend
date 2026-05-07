import { Router } from "express";
import { z } from "zod";
import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";
import { AttendanceModel } from "../models/attendance";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { StudentModel } from "../models/student";
import { env } from "../../config/env";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

attendanceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
    const date = req.query.date ? String(req.query.date) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;

    const filter: Record<string, unknown> = {};
    if (studentId) filter.studentId = studentId;
    if (date) filter.date = date;
    if (startDate || endDate) filter.date = { ...(startDate ? { $gte: startDate } : {}), ...(endDate ? { $lte: endDate } : {}) };
    if (subject) filter.subject = subject;

    const records = await AttendanceModel.find(filter).sort({ date: -1 }).lean();
    res.json({ ok: true, attendance: records });
  })
);

attendanceRouter.get(
  "/session",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const date = req.query.date ? String(req.query.date) : undefined;
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const isActive = req.query.isActive ? String(req.query.isActive) === "true" : true;

    const studentFilter: Record<string, unknown> = {};
    if (classLevel) studentFilter.classLevel = classLevel;
    if (typeof isActive === "boolean") studentFilter.isActive = isActive;
    if (subject) studentFilter.subjects = subject;

    const students = await StudentModel.find(studentFilter).sort({ classLevel: 1, firstName: 1, lastName: 1 }).lean();
    const studentIds = students.map((student) => student._id);

    const attendanceFilter: Record<string, unknown> = { studentId: { $in: studentIds } };
    if (date) attendanceFilter.date = date;
    if (subject) attendanceFilter.subject = subject;

    const records = await AttendanceModel.find(attendanceFilter).lean();
    res.json({ ok: true, students, records });
  })
);

attendanceRouter.get(
  "/history",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;

    const studentFilter: Record<string, unknown> = {};
    if (classLevel) studentFilter.classLevel = classLevel;
    if (subject) studentFilter.subjects = subject;

    const students = await StudentModel.find(studentFilter).lean();
    const studentsById = new Map(students.map((student) => [String(student._id), student]));

    const filter: Record<string, unknown> = { studentId: { $in: students.map((student) => student._id) } };
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (subject) filter.subject = subject;

    const records = await AttendanceModel.find(filter).sort({ date: -1, updatedAt: -1 }).limit(limit).lean();
    res.json({
      ok: true,
      records: records.map((record) => ({
        ...record,
        student: studentsById.get(String(record.studentId)) ?? null
      }))
    });
  })
);

const MarkSchema = z.object({
  studentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subject: z.string().trim().min(1),
  mode: z.enum(["ONLINE", "OFFLINE"]),
  status: z.enum(["PRESENT", "ABSENT"])
});

attendanceRouter.post(
  "/mark",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = MarkSchema.parse(req.body);
    const doc = await AttendanceModel.findOneAndUpdate(
      { studentId: body.studentId, date: body.date, subject: body.subject },
      { ...body, subject: body.subject.trim(), markedByUserId: req.user!.id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ ok: true, attendance: doc });
  })
);

const RecognizeSchema = z.object({
  imageBase64: z.string().min(200),
  classLevel: z.number().int().optional(),
  subject: z.string().trim().min(1).optional()
});

attendanceRouter.post(
  "/recognize",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = RecognizeSchema.parse(req.body);
    if (!env.AWS_REGION || !env.AWS_REKOGNITION_COLLECTION_ID) {
      throw new Error("AWS Rekognition is not configured. Set AWS_REGION and AWS_REKOGNITION_COLLECTION_ID.");
    }

    const base64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");
    const client = new RekognitionClient({ region: env.AWS_REGION });

    const command = new SearchFacesByImageCommand({
      CollectionId: env.AWS_REKOGNITION_COLLECTION_ID,
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
    const student = await StudentModel.findById(studentId).lean();
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
  })
);

attendanceRouter.get(
  "/student/:studentId",
  asyncHandler(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;

    const filter: Record<string, unknown> = { studentId: req.params.studentId };
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (subject) filter.subject = subject;

    const records = await AttendanceModel.find(filter).sort({ date: -1 }).lean();
    res.json({ ok: true, records });
  })
);
