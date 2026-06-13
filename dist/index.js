"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("./db/mongoose");
const env_1 = require("./config/env");
const app_1 = require("./server/app");
async function main() {
    await (0, mongoose_1.connectMongo)(env_1.env.MONGODB_URI);
    const app = (0, app_1.createApp)();
    app.listen(env_1.env.PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`[api] listening on http://localhost:${env_1.env.PORT}`);
    });
}
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[api] fatal:", err);
    process.exit(1);
});
