import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { FeePlanModel } from "../models/feePlan";
import { FeeAccountModel } from "../models/feeAccount";
import { HttpError } from "../utils/httpError";
import { addMonths, todayYmd } from "../utils/date";

export const feesRouter = Router();

feesRouter.use(requireAuth);

const CreatePlanSchema = z.object({
  name: z.string().min(1),
  classLevel: z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10)]),
  termsCount: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  totalAmount: z.number().min(0),
  installments: z
    .array(
      z.object({
        label: z.string().min(1),
        dueInMonths: z.number().int().min(0),
        amount: z.number().min(0)
      })
    )
    .min(1)
});

feesRouter.post(
  "/plans",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = CreatePlanSchema.parse(req.body);
    const sum = body.installments.reduce((acc, i) => acc + i.amount, 0);
    if (Math.abs(sum - body.totalAmount) > 0.01) {
      throw new HttpError(400, "TOTAL_MISMATCH", "Installments do not sum to totalAmount");
    }

    const plan = await FeePlanModel.create(body);
    res.status(201).json({ ok: true, plan });
  })
);

feesRouter.get(
  "/plans",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (_req, res) => {
    const plans = await FeePlanModel.find({}).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, plans });
  })
);

const CreateAccountSchema = z.object({
  studentId: z.string().min(1),
  planId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

feesRouter.post(
  "/accounts",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = CreateAccountSchema.parse(req.body);
    const plan = await FeePlanModel.findById(body.planId).lean();
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Fee plan not found");

    const startDate = body.startDate ?? todayYmd();
    const installments = plan.installments.map((t) => ({
      label: t.label,
      dueDate: addMonths(startDate, t.dueInMonths),
      amount: t.amount,
      status: "DUE" as const
    }));

    const account = await FeeAccountModel.create({ studentId: body.studentId, planId: plan._id, startDate, installments });
    res.status(201).json({ ok: true, account });
  })
);

feesRouter.get(
  "/accounts/student/:studentId",
  asyncHandler(async (req, res) => {
    const account = await FeeAccountModel.findOne({ studentId: req.params.studentId }).lean();
    res.json({ ok: true, account });
  })
);

feesRouter.get(
  "/accounts",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
    const filter: Record<string, unknown> = {};
    if (studentId) filter.studentId = studentId;

    const accounts = await FeeAccountModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, accounts });
  })
);

feesRouter.get(
  "/accounts/:accountId",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const account = await FeeAccountModel.findById(req.params.accountId).lean();
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found");
    res.json({ ok: true, account });
  })
);

const PaySchema = z.object({
  installmentIndex: z.number().int().min(0),
  paidAmount: z.number().min(0),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().optional()
});

feesRouter.post(
  "/accounts/:accountId/pay",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = PaySchema.parse(req.body);
    const account = await FeeAccountModel.findById(req.params.accountId);
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found");
    const inst = account.installments[body.installmentIndex];
    if (!inst) throw new HttpError(400, "INVALID_INDEX", "Installment not found");

    inst.status = "PAID";
    inst.paidAt = todayYmd();
    inst.paidAmount = body.paidAmount;
    inst.paymentMode = body.paymentMode;
    inst.reference = body.reference;
    await account.save();

    res.json({ ok: true, account });
  })
);
