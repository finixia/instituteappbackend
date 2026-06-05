import mongoose, { Schema } from "mongoose";

export type UserRole = "ADMIN" | "TEACHER" | "PARENT";

export interface UserDoc {
  email?: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  linkedStudentIds?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ["ADMIN", "TEACHER", "PARENT"] },
    linkedStudentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }]
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<UserDoc>("User", UserSchema);
