import mongoose, { Schema } from "mongoose";
import type { ClassLevel } from "./student";

export interface ExamDoc {
  title: string;
  classLevel: ClassLevel;
  subject: string;
  date: string; // YYYY-MM-DD
  maxMarks: number;
  passingMarks: number;
  publishedAt?: Date;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema = new Schema<ExamDoc>(
  {
    title: { type: String, required: true, trim: true },
    classLevel: { type: Number, required: true, enum: [6, 7, 8, 9, 10], index: true },
    subject: { type: String, required: true, trim: true },
    date: { type: String, required: true, index: true },
    maxMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 0 },
    publishedAt: { type: Date, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

export const ExamModel = mongoose.model<ExamDoc>("Exam", ExamSchema);

