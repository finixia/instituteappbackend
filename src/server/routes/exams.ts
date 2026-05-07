import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { ExamModel } from "../models/exam";
import { ExamScoreModel } from "../models/examScore";
import { StudentModel } from "../models/student";
import { HttpError } from "../utils/httpError";

export const examsRouter = Router();

examsRouter.use(requireAuth);

examsRouter.get(
  "/",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const classLevel = req.query.classLevel ? Number(req.query.classLevel) : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;

    const filter: Record<string, unknown> = {};
    if (classLevel) filter.classLevel = classLevel;
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

    const exams = await ExamModel.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ ok: true, exams });
  })
);

const CreateExamSchema = z.object({
  title: z.string().min(1),
  classLevel: z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10)]),
  subject: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxMarks: z.number().int().positive()
});

examsRouter.post(
  "/",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = CreateExamSchema.parse(req.body);
    const exam = await ExamModel.create({ ...body, createdByUserId: req.user!.id });
    res.status(201).json({ ok: true, exam });
  })
);

examsRouter.get(
  "/:examId",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const exam = await ExamModel.findById(req.params.examId).lean();
    if (!exam) throw new HttpError(404, "NOT_FOUND", "Exam not found");
    res.json({ ok: true, exam });
  })
);

examsRouter.get(
  "/:examId/scores",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const exam = await ExamModel.findById(req.params.examId).lean();
    if (!exam) throw new HttpError(404, "NOT_FOUND", "Exam not found");

    const scores = await ExamScoreModel.find({ examId: req.params.examId }).lean();
    res.json({ ok: true, scores });
  })
);

examsRouter.get(
  "/:examId/results",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const exam = await ExamModel.findById(req.params.examId).lean();
    if (!exam) throw new HttpError(404, "NOT_FOUND", "Exam not found");

    const scores = await ExamScoreModel.find({ examId: req.params.examId }).lean();
    const students = await StudentModel.find({ _id: { $in: scores.map((score) => score.studentId) } }).lean();
    const studentsById = new Map(students.map((student) => [String(student._id), student]));

    const ranked = scores
      .map((score) => ({
        score,
        student: studentsById.get(String(score.studentId)) ?? null,
        percent: exam.maxMarks > 0 ? Math.round((score.isAbsent ? 0 : (score.marks / exam.maxMarks) * 100)) : 0
      }))
      .sort((a, b) => {
        if (a.score.isAbsent !== b.score.isAbsent) return a.score.isAbsent ? 1 : -1;
        return b.score.marks - a.score.marks;
      });

    let currentRank = 0;
    let previousMarks: number | null = null;
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
  })
);

const UpsertScoreSchema = z.object({
  studentId: z.string().min(1),
  marks: z.number().min(0),
  isAbsent: z.boolean().optional().default(false)
});

examsRouter.put(
  "/:examId/scores",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = UpsertScoreSchema.parse(req.body);
    const exam = await ExamModel.findById(req.params.examId).lean();
    if (!exam) throw new HttpError(404, "NOT_FOUND", "Exam not found");
    if (!body.isAbsent && body.marks > exam.maxMarks) throw new HttpError(400, "INVALID_MARKS", "Marks exceed maxMarks");

    const score = await ExamScoreModel.findOneAndUpdate(
      { examId: req.params.examId, studentId: body.studentId },
      { ...body, updatedByUserId: req.user!.id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ ok: true, score });
  })
);

examsRouter.put(
  "/:examId/publish",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const exam = await ExamModel.findById(req.params.examId).lean();
    if (!exam) throw new HttpError(404, "NOT_FOUND", "Exam not found");

    const updated = await ExamModel.findByIdAndUpdate(
      req.params.examId,
      { publishedAt: new Date() },
      { new: true }
    ).lean();

    res.json({ ok: true, exam: updated });
  })
);

examsRouter.get(
  "/student/:studentId",
  asyncHandler(async (req, res) => {
    const scores = await ExamScoreModel.find({ studentId: req.params.studentId }).sort({ updatedAt: -1 }).lean();
    const examIds = scores.map((s) => s.examId);
    const exams = await ExamModel.find({ _id: { $in: examIds } }).lean();
    const examsById = new Map(exams.map((e) => [String(e._id), e]));

    res.json({
      ok: true,
      results: scores.map((s) => ({ score: s, exam: examsById.get(String(s.examId)) }))
    });
  })
);
