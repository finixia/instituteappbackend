import mongoose, { Schema } from "mongoose";

export interface AppSettingsDoc {
  key: string;
  supportEmail: string;
  supportPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingsSchema = new Schema<AppSettingsDoc>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    supportEmail: { type: String, required: true, trim: true, lowercase: true, default: "support@instituteapp.com" },
    supportPhone: { type: String, required: true, trim: true, default: "+1-234-567-890" }
  },
  { timestamps: true }
);

export const AppSettingsModel = mongoose.model<AppSettingsDoc>("AppSettings", AppSettingsSchema);
