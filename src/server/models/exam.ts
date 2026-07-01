import mongoose, { Schema } from "mongoose";
import type { ClassLevel } from "./student";

export interface ExamDoc {
  title: string;
  examType: "SINGLE" | "ENTRANCE";
  classLevel: ClassLevel;
  subject: string;
  components?: Array<{ subject: string; maxMarks: number; passingMarks: number }>;
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
    examType: { type: String, required: true, enum: ["SINGLE", "ENTRANCE"], default: "SINGLE" },
    classLevel: { type: Number, required: true, enum: [6, 7, 8, 9, 10], index: true },
    subject: { type: String, required: true, trim: true },
    components: {
      type: [
        {
          subject: { type: String, required: true, trim: true },
          maxMarks: { type: Number, required: true, min: 1 },
          passingMarks: { type: Number, required: true, min: 0, default: 0 }
        }
      ],
      default: []
    },
    date: { type: String, required: true, index: true },
    maxMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 0 },
    publishedAt: { type: Date, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

export const ExamModel = mongoose.model<ExamDoc>("Exam", ExamSchema);
