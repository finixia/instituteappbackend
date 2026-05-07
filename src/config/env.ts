import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ADMIN_INVITE_CODE: z.string().min(6),
  AWS_REGION: z.string().optional(),
  AWS_REKOGNITION_COLLECTION_ID: z.string().optional()
});

console.log("CWD:", process.cwd());
export const env = EnvSchema.parse(process.env);