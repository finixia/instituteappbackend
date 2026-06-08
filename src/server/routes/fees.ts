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
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
      throw new HttpError(400, "TOTAL_MISMATCH", "Sum of installments does not match the total amount.", {
        expectedTotal: body.totalAmount,
        installmentsSum: sum
      });
    }

    const plan = await FeePlanModel.create(body);
    res.status(201).json({ ok: true, plan });
  })
);

feesRouter.put(
  "/plans/:planId",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = CreatePlanSchema.parse(req.body);
    const plan = await FeePlanModel.findById(req.params.planId);
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: req.params.planId });

    const sum = body.installments.reduce((acc, i) => acc + i.amount, 0);
    if (Math.abs(sum - body.totalAmount) > 0.01) {
      throw new HttpError(400, "TOTAL_MISMATCH", "Sum of installments does not match the total amount.", {
        expectedTotal: body.totalAmount,
        installmentsSum: sum
      });
    }

    plan.name = body.name;
    plan.classLevel = body.classLevel;
    plan.termsCount = body.termsCount as any;
    plan.totalAmount = body.totalAmount;
    plan.installments = body.installments as any;
    await plan.save();

    res.json({ ok: true, plan });
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

feesRouter.delete(
  "/plans/:planId",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const plan = await FeePlanModel.findById(req.params.planId);
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: req.params.planId });
    await plan.deleteOne();
    res.json({ ok: true });
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
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: body.planId });

    const startDate = body.startDate ?? todayYmd();
    const installments = plan.installments.map((t) => ({
      label: t.label,
      dueDate: t.dueDate ?? addMonths(startDate, t.dueInMonths ?? 0),
      amount: t.amount,
      status: "DUE" as const
    }));

    const account = await FeeAccountModel.create({ studentId: body.studentId, planId: plan._id, startDate, installments });
    res.status(201).json({ ok: true, account });
  })
);

const UpdateAccountSchema = z.object({
  planId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const AddInstallmentSchema = z.object({
  label: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().min(0)
});

feesRouter.post(
  "/accounts/:accountId/installments",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = AddInstallmentSchema.parse(req.body);
    const account = await FeeAccountModel.findById(req.params.accountId);
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });

    account.installments.push({
      label: body.label,
      dueDate: body.dueDate,
      amount: body.amount,
      status: "DUE"
    } as any);

    await account.save();
    res.status(201).json({ ok: true, account });
  })
);

feesRouter.put(
  "/accounts/:accountId",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = UpdateAccountSchema.parse(req.body);
    const account = await FeeAccountModel.findById(req.params.accountId);
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });

    // If planId provided, replace installments based on the plan
    if (body.planId) {
      const plan = await FeePlanModel.findById(body.planId).lean();
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: body.planId });
      const startDate = body.startDate ?? account.startDate;
      account.planId = plan._id;
      account.startDate = startDate;
      account.installments = plan.installments.map((t) => ({
        label: t.label,
        dueDate: t.dueDate ?? addMonths(startDate, t.dueInMonths ?? 0),
        amount: t.amount,
        status: "DUE"
      } as any));
    } else if (body.startDate) {
      // Only start date changed — recompute dueDate values for existing plan
      const plan = await FeePlanModel.findById(account.planId).lean();
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: account.planId });
      account.startDate = body.startDate;
      account.installments = plan.installments.map((t) => ({
        label: t.label,
        dueDate: t.dueDate ?? addMonths(body.startDate!, t.dueInMonths ?? 0),
        amount: t.amount,
        status: "DUE"
      } as any));
    }

    await account.save();
    res.json({ ok: true, account });
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
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    res.json({ ok: true, account });
  })
);

const PaySchema = z.object({
  installmentIndex: z.number().int().min(0),
  paidAmount: z.number().min(0),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().optional()
});

const UpdateInstallmentSchema = z.object({
  status: z.enum(["DUE", "PAID"]),
  amount: z.number().min(0),
  paidAmount: z.number().min(0).optional(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).optional(),
  reference: z.string().optional()
});

feesRouter.put(
  "/accounts/:accountId/installments/:installmentIndex",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = UpdateInstallmentSchema.parse(req.body);
    const account = await FeeAccountModel.findById(req.params.accountId);
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    const index = Number(req.params.installmentIndex);
    if (!Number.isInteger(index) || index < 0) {
      throw new HttpError(400, "INVALID_INDEX", "Installment index is invalid.", { installmentIndex: req.params.installmentIndex });
    }

    const inst = account.installments[index];
    if (!inst) throw new HttpError(400, "INVALID_INDEX", "Installment not found.", { installmentIndex: index });

    const oldSurplus = (inst.paidAmount ?? inst.amount) - inst.amount;
    const newAmount = body.amount;
    const newPaidAmount = typeof body.paidAmount !== "undefined" ? body.paidAmount : (body.status === "PAID" ? inst.paidAmount ?? newAmount : undefined);

    if (body.status === "PAID") {
      if (newPaidAmount === undefined) {
        throw new HttpError(400, "MISSING_PAID_AMOUNT", "Paid amount is required for a paid installment.");
      }

      const newSurplus = newPaidAmount - newAmount;
      const delta = newSurplus - oldSurplus;

      inst.amount = newAmount;
      inst.status = "PAID";
      inst.paidAt = inst.paidAt ?? todayYmd();
      inst.paidAmount = newPaidAmount;
      inst.paymentMode = body.paymentMode ?? inst.paymentMode ?? "CASH";
      inst.reference = body.reference ?? inst.reference;

      if (delta !== 0) {
        adjustFutureInstallmentAmounts(account.installments, index + 1, delta);
      }
    } else {
      inst.amount = newAmount;
      inst.status = "DUE";
      inst.paidAt = undefined;
      inst.paidAmount = undefined;
      inst.paymentMode = undefined;
      inst.reference = undefined;

      if (oldSurplus !== 0) {
        adjustFutureInstallmentAmounts(account.installments, index + 1, -oldSurplus);
      }
    }

    await account.save();
    res.json({ ok: true, account });
  })
);

function adjustFutureInstallmentAmounts(installments: any[], startIndex: number, remainder: number) {
  if (!installments || remainder === 0) return;
  let remaining = remainder;

  for (let i = startIndex; i < installments.length && remaining !== 0; i++) {
    const nextInstallment = installments[i];
    if (nextInstallment.status !== "DUE") continue;

    const updatedAmount = nextInstallment.amount - remaining;
    if (updatedAmount < 0) {
      nextInstallment.amount = 0;
      remaining = updatedAmount;
    } else {
      nextInstallment.amount = updatedAmount;
      remaining = 0;
    }
  }

  if (remaining !== 0) {
    throw new HttpError(400, "INSTALLMENT_ADJUSTMENT_FAILED", "Payment adjustment cannot be applied to future due installments.", {
      remaining
    });
  }
}

feesRouter.post(
  "/accounts/:accountId/pay",
  requireRole("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const body = PaySchema.parse(req.body);
    const account = await FeeAccountModel.findById(req.params.accountId);
    if (!account) throw new HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    const inst = account.installments[body.installmentIndex];
    if (!inst) throw new HttpError(400, "INVALID_INDEX", "Installment not found.", { installmentIndex: body.installmentIndex });
    if (inst.status === "PAID") throw new HttpError(400, "ALREADY_PAID", "Installment has already been paid.", { installmentIndex: body.installmentIndex });

    const remainder = body.paidAmount - inst.amount;
    inst.status = "PAID";
    inst.paidAt = todayYmd();
    inst.paidAmount = body.paidAmount;
    inst.paymentMode = body.paymentMode;
    inst.reference = body.reference;

    adjustFutureInstallmentAmounts(account.installments, body.installmentIndex + 1, remainder);
    await account.save();

    res.json({ ok: true, account });
  })
);
