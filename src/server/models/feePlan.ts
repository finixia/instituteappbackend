import mongoose, { Schema } from "mongoose";
import type { ClassLevel } from "./student";

export interface FeeInstallmentTemplate {
  label: string;
  dueDate: string;
  dueInMonths?: number;
  amount: number;
}

export interface FeePlanDoc {
  name: string;
  classLevel: ClassLevel;
  termsCount: 1 | 2 | 3 | 4;
  totalAmount: number;
  installments: FeeInstallmentTemplate[];
  createdAt: Date;
  updatedAt: Date;
}

const FeePlanSchema = new Schema<FeePlanDoc>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    classLevel: { type: Number, required: true, enum: [6, 7, 8, 9, 10], index: true },
    termsCount: { type: Number, required: true, enum: [1, 2, 3, 4] },
    totalAmount: { type: Number, required: true, min: 0 },
    installments: [
      {
        label: { type: String, required: true },
        dueDate: { type: String, required: true },
        dueInMonths: { type: Number, min: 0 },
        amount: { type: Number, required: true, min: 0 }
      }
    ]
  },
  { timestamps: true }
);

export const FeePlanModel = mongoose.model<FeePlanDoc>("FeePlan", FeePlanSchema);
