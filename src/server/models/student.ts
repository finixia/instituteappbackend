import mongoose, { Schema } from "mongoose";

export type ClassLevel = 6 | 7 | 8 | 9 | 10;

export interface StudentDoc {
  firstName: string;
  lastName?: string;
  classLevel: ClassLevel;
  subjects: string[];
  parentPhones: string[];
  admissionDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<StudentDoc>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    classLevel: { type: Number, required: true, enum: [6, 7, 8, 9, 10] },
    subjects: [{ type: String, required: true, trim: true }],
    parentPhones: [{ type: String, required: true }],
    admissionDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const StudentModel = mongoose.model<StudentDoc>("Student", StudentSchema);
