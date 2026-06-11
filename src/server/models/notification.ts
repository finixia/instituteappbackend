import mongoose, { Schema } from "mongoose";

export interface NotificationDoc {
  recipientUserId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  type?: string | null;
  read?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<NotificationDoc>(
  {
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: null },
    type: { type: String, default: null },
    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model<NotificationDoc>("Notification", NotificationSchema);
