import { env } from "../config/env";
import { connectMongo } from "../db/mongoose";
import { UserModel } from "../server/models/user";
import { hashPassword } from "../server/utils/password";

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

  await connectMongo(env.MONGODB_URI);

  const exists = await UserModel.findOne({ email: email.toLowerCase() }).lean();
  if (exists) {
    console.error("User with this email already exists");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({ email: email.toLowerCase(), passwordHash, role: "ADMIN" as const });

  console.log("Created admin user:", { id: String(user._id), email: user.email });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
