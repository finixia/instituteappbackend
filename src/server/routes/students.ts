import { Router } from "express";
import { z } from "zod";
import { RekognitionClient, IndexFacesCommand, DeleteFacesCommand } from "@aws-sdk/client-rekognition";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { StudentModel } from "../models/student";
import { HttpError } from "../utils/httpError";
import { env } from "../../config/env";

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

const CreateStudentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  classLevel: z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10)]),
  subjects: z.array(z.string().trim().min(1)).min(1),
  parentPhones: z.array(z.string().min(6)).min(1),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

studentsRouter.post(
  "/",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = CreateStudentSchema.parse(req.body);
    const student = await StudentModel.create({
      ...body,
      subjects: body.subjects.map((subject) => subject.trim()),
      admissionDate: new Date(body.admissionDate)
    });
    res.status(201).json({ ok: true, student });
  })
);

studentsRouter.get(
  "/",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const isActive = req.query.isActive ? String(req.query.isActive) === "true" : undefined;
    const q = req.query.q ? String(req.query.q).trim() : undefined;
    const subject = req.query.subject ? String(req.query.subject).trim() : undefined;

    const filter: Record<string, unknown> = {};
    if (classLevel) filter.classLevel = classLevel;
    if (typeof isActive === "boolean") filter.isActive = isActive;
    if (q) filter.firstName = { $regex: q, $options: "i" };
    if (subject) filter.subjects = subject;

    const students = await StudentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, students });
  })
);

studentsRouter.get(
  "/:id",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const student = await StudentModel.findById(req.params.id).lean();
    if (!student) throw new HttpError(404, "NOT_FOUND", "Student not found");
    res.json({ ok: true, student });
  })
);

const UpdateStudentSchema = CreateStudentSchema.partial().extend({
  isActive: z.boolean().optional()
});

studentsRouter.patch(
  "/:id",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const patch = UpdateStudentSchema.parse(req.body);
    const update: Record<string, unknown> = { ...patch };
    if (patch.admissionDate) update.admissionDate = new Date(patch.admissionDate);
    if (patch.subjects) update.subjects = patch.subjects.map((subject) => subject.trim());

    const student = await StudentModel.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!student) throw new HttpError(404, "NOT_FOUND", "Student not found");
    res.json({ ok: true, student });
  })
);

studentsRouter.delete(
  "/:id",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const student = await StudentModel.findByIdAndDelete(req.params.id).lean();
    if (!student) throw new HttpError(404, "NOT_FOUND", "Student not found");
    res.json({ ok: true });
  })
);

const EnrollFaceSchema = z.object({
  imageBase64: z.string().min(200)
});

studentsRouter.post(
  "/:id/enroll-face",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const student = await StudentModel.findById(req.params.id);
    if (!student) throw new HttpError(404, "NOT_FOUND", "Student not found");

    if (!env.AWS_REGION || !env.AWS_REKOGNITION_COLLECTION_ID) {
      throw new Error("AWS Rekognition is not configured. Set AWS_REGION and AWS_REKOGNITION_COLLECTION_ID.");
    }

    const body = EnrollFaceSchema.parse(req.body);
    const base64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");

    const client = new RekognitionClient({ region: env.AWS_REGION });

    // Index the face in the collection
    const indexCommand = new IndexFacesCommand({
      CollectionId: env.AWS_REKOGNITION_COLLECTION_ID,
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
  })
);
