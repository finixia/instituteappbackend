"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const mongoose_1 = require("../db/mongoose");
const user_1 = require("../server/models/user");
const password_1 = require("../server/utils/password");
async function main() {
    const [, , email, password] = process.argv;
    if (!email || !password) {
        console.error("Usage: npm run create-admin -- <email> <password>");
        process.exit(1);
    }
    if (password.length < 8) {
        console.error("Password must be at least 8 characters");
        process.exit(1);
    }
    await (0, mongoose_1.connectMongo)(env_1.env.MONGODB_URI);
    const exists = await user_1.UserModel.findOne({ email: email.toLowerCase() }).lean();
    if (exists) {
        console.error("User with this email already exists");
        process.exit(1);
    }
    const passwordHash = await (0, password_1.hashPassword)(password);
    const user = await user_1.UserModel.create({ email: email.toLowerCase(), passwordHash, role: "ADMIN" });
    console.log("Created admin user:", { id: String(user._id), email: user.email });
    process.exit(0);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
