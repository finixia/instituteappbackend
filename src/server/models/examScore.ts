import mongoose, { Schema } from "mongoose";

export interface ExamScoreDoc {
  examId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  marks: number;
  componentMarks?: Array<{ subject: string; marks: number }>;
  isAbsent: boolean;
  updatedByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamScoreSchema = new Schema<ExamScoreDoc>(
  {
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    marks: { type: Number, required: true, min: 0 },
    componentMarks: {
      type: [
        {
          subject: { type: String, required: true, trim: true },
          marks: { type: Number, required: true, min: 0 }
        }
      ],
      default: []
    },
    isAbsent: { type: Boolean, required: true, default: false },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

ExamScoreSchema.index({ examId: 1, studentId: 1 }, { unique: true });

export const ExamScoreModel = mongoose.model<ExamScoreDoc>("ExamScore", ExamScoreSchema);
