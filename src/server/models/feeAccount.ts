import mongoose, { Schema } from "mongoose";

export type FeePaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";

export interface FeeInstallment {
  label: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: "DUE" | "PAID";
  paidAt?: string;
  paidAmount?: number;
  paymentMode?: FeePaymentMode;
  reference?: string;
}

export interface FeeAccountDoc {
  studentId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  startDate: string; // YYYY-MM-DD
  installments: FeeInstallment[];
  createdAt: Date;
  updatedAt: Date;
}

const FeeAccountSchema = new Schema<FeeAccountDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, unique: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: "FeePlan", required: true },
    startDate: { type: String, required: true },
    installments: [
      {
        label: { type: String, required: true },
        dueDate: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        status: { type: String, required: true, enum: ["DUE", "PAID"], default: "DUE" },
        paidAt: { type: String },
        paidAmount: { type: Number, min: 0 },
        paymentMode: { type: String, enum: ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] },
        reference: { type: String }
      }
    ]
  },
  { timestamps: true }
);

export const FeeAccountModel = mongoose.model<FeeAccountDoc>("FeeAccount", FeeAccountSchema);

