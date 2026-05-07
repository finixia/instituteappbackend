import mongoose, { Schema } from "mongoose";

export type AttendanceMode = "ONLINE" | "OFFLINE";
export type AttendanceStatus = "PRESENT" | "ABSENT";

export interface AttendanceDoc {
  studentId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  subject: string;
  mode: AttendanceMode;
  status: AttendanceStatus;
  markedByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<AttendanceDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    date: { type: String, required: true, index: true },
    subject: { type: String, required: true, trim: true, index: true },
    mode: { type: String, required: true, enum: ["ONLINE", "OFFLINE"] },
    status: { type: String, required: true, enum: ["PRESENT", "ABSENT"], index: true },
    markedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

AttendanceSchema.index({ studentId: 1, date: 1, subject: 1 }, { unique: true });

export const AttendanceModel = mongoose.model<AttendanceDoc>("Attendance", AttendanceSchema);
