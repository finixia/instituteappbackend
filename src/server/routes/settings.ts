import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { AppSettingsModel } from "../models/appSettings";

export const settingsRouter = Router();

const DEFAULT_SETTINGS = {
  supportEmail: "support@instituteapp.com",
  supportPhone: "+1-234-567-890"
};

const SettingsSchema = z.object({
  supportEmail: z.string().email(),
  supportPhone: z.string().min(6).max(30)
});

async function getSettings() {
  const settings = await AppSettingsModel.findOne({ key: "default" }).lean();
  return settings ?? DEFAULT_SETTINGS;
}

settingsRouter.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
      ok: true,
      settings: {
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone
      }
    });
  })
);

settingsRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
      ok: true,
      settings: {
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone
      }
    });
  })
);

settingsRouter.put(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = SettingsSchema.parse(req.body);
    const settings = await AppSettingsModel.findOneAndUpdate(
      { key: "default" },
      { key: "default", supportEmail: body.supportEmail, supportPhone: body.supportPhone },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({
      ok: true,
      settings: {
        supportEmail: settings?.supportEmail ?? body.supportEmail,
        supportPhone: settings?.supportPhone ?? body.supportPhone
      }
    });
  })
);
