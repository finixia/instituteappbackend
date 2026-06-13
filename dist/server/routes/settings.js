"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const asyncHandler_1 = require("../middleware/asyncHandler");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const appSettings_1 = require("../models/appSettings");
exports.settingsRouter = (0, express_1.Router)();
const DEFAULT_SETTINGS = {
    supportEmail: "support@instituteapp.com",
    supportPhone: "+1-234-567-890"
};
const SettingsSchema = zod_1.z.object({
    supportEmail: zod_1.z.string().email(),
    supportPhone: zod_1.z.string().min(6).max(30)
});
async function getSettings() {
    const settings = await appSettings_1.AppSettingsModel.findOne({ key: "default" }).lean();
    return settings ?? DEFAULT_SETTINGS;
}
exports.settingsRouter.get("/public", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const settings = await getSettings();
    res.json({
        ok: true,
        settings: {
            supportEmail: settings.supportEmail,
            supportPhone: settings.supportPhone
        }
    });
}));
exports.settingsRouter.get("/", requireAuth_1.requireAuth, (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const settings = await getSettings();
    res.json({
        ok: true,
        settings: {
            supportEmail: settings.supportEmail,
            supportPhone: settings.supportPhone
        }
    });
}));
exports.settingsRouter.put("/", requireAuth_1.requireAuth, (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = SettingsSchema.parse(req.body);
    const settings = await appSettings_1.AppSettingsModel.findOneAndUpdate({ key: "default" }, { key: "default", supportEmail: body.supportEmail, supportPhone: body.supportPhone }, { new: true, upsert: true, runValidators: true }).lean();
    res.json({
        ok: true,
        settings: {
            supportEmail: settings?.supportEmail ?? body.supportEmail,
            supportPhone: settings?.supportPhone ?? body.supportPhone
        }
    });
}));
