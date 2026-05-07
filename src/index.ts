import { connectMongo } from "./db/mongoose";
import { env } from "./config/env";
import { createApp } from "./server/app";

async function main() {
  await connectMongo(env.MONGODB_URI);

  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[api] fatal:", err);
  process.exit(1);
});

