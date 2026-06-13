"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
dotenv_1.default.config({
    path: path_1.default.resolve(process.cwd(), ".env"),
});
const EnvSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().int().positive().default(4000),
    MONGODB_URI: zod_1.z.string().min(1),
    JWT_SECRET: zod_1.z.string().min(16),
    ADMIN_INVITE_CODE: zod_1.z.string().min(6),
    AWS_REGION: zod_1.z.string().optional(),
    AWS_REKOGNITION_COLLECTION_ID: zod_1.z.string().optional()
});
console.log("CWD:", process.cwd());
exports.env = EnvSchema.parse(process.env);
