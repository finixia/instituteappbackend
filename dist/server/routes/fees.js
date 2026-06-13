"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const asyncHandler_1 = require("../middleware/asyncHandler");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const feePlan_1 = require("../models/feePlan");
const feeAccount_1 = require("../models/feeAccount");
const httpError_1 = require("../utils/httpError");
const date_1 = require("../utils/date");
exports.feesRouter = (0, express_1.Router)();
exports.feesRouter.use(requireAuth_1.requireAuth);
const CreatePlanSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    classLevel: zod_1.z.union([zod_1.z.literal(6), zod_1.z.literal(7), zod_1.z.literal(8), zod_1.z.literal(9), zod_1.z.literal(10)]),
    termsCount: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3), zod_1.z.literal(4)]),
    totalAmount: zod_1.z.number().min(0),
    installments: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().min(1),
        dueDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: zod_1.z.number().min(0)
    }))
        .min(1)
});
exports.feesRouter.post("/plans", (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = CreatePlanSchema.parse(req.body);
    const sum = body.installments.reduce((acc, i) => acc + i.amount, 0);
    if (Math.abs(sum - body.totalAmount) > 0.01) {
        throw new httpError_1.HttpError(400, "TOTAL_MISMATCH", "Sum of installments does not match the total amount.", {
            expectedTotal: body.totalAmount,
            installmentsSum: sum
        });
    }
    const plan = await feePlan_1.FeePlanModel.create(body);
    res.status(201).json({ ok: true, plan });
}));
exports.feesRouter.put("/plans/:planId", (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = CreatePlanSchema.parse(req.body);
    const plan = await feePlan_1.FeePlanModel.findById(req.params.planId);
    if (!plan)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: req.params.planId });
    const sum = body.installments.reduce((acc, i) => acc + i.amount, 0);
    if (Math.abs(sum - body.totalAmount) > 0.01) {
        throw new httpError_1.HttpError(400, "TOTAL_MISMATCH", "Sum of installments does not match the total amount.", {
            expectedTotal: body.totalAmount,
            installmentsSum: sum
        });
    }
    plan.name = body.name;
    plan.classLevel = body.classLevel;
    plan.termsCount = body.termsCount;
    plan.totalAmount = body.totalAmount;
    plan.installments = body.installments;
    await plan.save();
    res.json({ ok: true, plan });
}));
exports.feesRouter.get("/plans", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const plans = await feePlan_1.FeePlanModel.find({}).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, plans });
}));
exports.feesRouter.delete("/plans/:planId", (0, requireRole_1.requireRole)("ADMIN"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const plan = await feePlan_1.FeePlanModel.findById(req.params.planId);
    if (!plan)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: req.params.planId });
    await plan.deleteOne();
    res.json({ ok: true });
}));
const CreateAccountSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    planId: zod_1.z.string().min(1),
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
exports.feesRouter.post("/accounts", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = CreateAccountSchema.parse(req.body);
    const plan = await feePlan_1.FeePlanModel.findById(body.planId).lean();
    if (!plan)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: body.planId });
    const startDate = body.startDate ?? (0, date_1.todayYmd)();
    const installments = plan.installments.map((t) => ({
        label: t.label,
        dueDate: t.dueDate ?? (0, date_1.addMonths)(startDate, t.dueInMonths ?? 0),
        amount: t.amount,
        status: "DUE"
    }));
    const account = await feeAccount_1.FeeAccountModel.create({ studentId: body.studentId, planId: plan._id, startDate, installments });
    res.status(201).json({ ok: true, account });
}));
const UpdateAccountSchema = zod_1.z.object({
    planId: zod_1.z.string().min(1).optional(),
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
const AddInstallmentSchema = zod_1.z.object({
    label: zod_1.z.string().min(1),
    dueDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: zod_1.z.number().min(0)
});
exports.feesRouter.post("/accounts/:accountId/installments", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = AddInstallmentSchema.parse(req.body);
    const account = await feeAccount_1.FeeAccountModel.findById(req.params.accountId);
    if (!account)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    account.installments.push({
        label: body.label,
        dueDate: body.dueDate,
        amount: body.amount,
        status: "DUE"
    });
    await account.save();
    res.status(201).json({ ok: true, account });
}));
exports.feesRouter.put("/accounts/:accountId", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = UpdateAccountSchema.parse(req.body);
    const account = await feeAccount_1.FeeAccountModel.findById(req.params.accountId);
    if (!account)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    // If planId provided, replace installments based on the plan
    if (body.planId) {
        const plan = await feePlan_1.FeePlanModel.findById(body.planId).lean();
        if (!plan)
            throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: body.planId });
        const startDate = body.startDate ?? account.startDate;
        account.planId = plan._id;
        account.startDate = startDate;
        account.installments = plan.installments.map((t) => ({
            label: t.label,
            dueDate: t.dueDate ?? (0, date_1.addMonths)(startDate, t.dueInMonths ?? 0),
            amount: t.amount,
            status: "DUE"
        }));
    }
    else if (body.startDate) {
        // Only start date changed — recompute dueDate values for existing plan
        const plan = await feePlan_1.FeePlanModel.findById(account.planId).lean();
        if (!plan)
            throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee plan not found.", { planId: account.planId });
        account.startDate = body.startDate;
        account.installments = plan.installments.map((t) => ({
            label: t.label,
            dueDate: t.dueDate ?? (0, date_1.addMonths)(body.startDate, t.dueInMonths ?? 0),
            amount: t.amount,
            status: "DUE"
        }));
    }
    await account.save();
    res.json({ ok: true, account });
}));
exports.feesRouter.get("/accounts/student/:studentId", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const account = await feeAccount_1.FeeAccountModel.findOne({ studentId: req.params.studentId }).lean();
    res.json({ ok: true, account });
}));
exports.feesRouter.get("/accounts", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
    const filter = {};
    if (studentId)
        filter.studentId = studentId;
    const accounts = await feeAccount_1.FeeAccountModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, accounts });
}));
exports.feesRouter.get("/accounts/:accountId", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const account = await feeAccount_1.FeeAccountModel.findById(req.params.accountId).lean();
    if (!account)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    res.json({ ok: true, account });
}));
const PaySchema = zod_1.z.object({
    installmentIndex: zod_1.z.number().int().min(0),
    paidAmount: zod_1.z.number().min(0),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]),
    reference: zod_1.z.string().optional()
});
const UpdateInstallmentSchema = zod_1.z.object({
    status: zod_1.z.enum(["DUE", "PAID"]),
    amount: zod_1.z.number().min(0),
    paidAmount: zod_1.z.number().min(0).optional(),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).optional(),
    reference: zod_1.z.string().optional()
});
exports.feesRouter.put("/accounts/:accountId/installments/:installmentIndex", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = UpdateInstallmentSchema.parse(req.body);
    const account = await feeAccount_1.FeeAccountModel.findById(req.params.accountId);
    if (!account)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    const index = Number(req.params.installmentIndex);
    if (!Number.isInteger(index) || index < 0) {
        throw new httpError_1.HttpError(400, "INVALID_INDEX", "Installment index is invalid.", { installmentIndex: req.params.installmentIndex });
    }
    const inst = account.installments[index];
    if (!inst)
        throw new httpError_1.HttpError(400, "INVALID_INDEX", "Installment not found.", { installmentIndex: index });
    const oldSurplus = (inst.paidAmount ?? inst.amount) - inst.amount;
    const newAmount = body.amount;
    const newPaidAmount = typeof body.paidAmount !== "undefined" ? body.paidAmount : (body.status === "PAID" ? inst.paidAmount ?? newAmount : undefined);
    if (body.status === "PAID") {
        if (newPaidAmount === undefined) {
            throw new httpError_1.HttpError(400, "MISSING_PAID_AMOUNT", "Paid amount is required for a paid installment.");
        }
        const newSurplus = newPaidAmount - newAmount;
        const delta = newSurplus - oldSurplus;
        inst.amount = newAmount;
        inst.status = "PAID";
        inst.paidAt = inst.paidAt ?? (0, date_1.todayYmd)();
        inst.paidAmount = newPaidAmount;
        inst.paymentMode = body.paymentMode ?? inst.paymentMode ?? "CASH";
        inst.reference = body.reference ?? inst.reference;
        if (delta !== 0) {
            adjustFutureInstallmentAmounts(account.installments, index + 1, delta);
        }
    }
    else {
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
}));
function adjustFutureInstallmentAmounts(installments, startIndex, remainder) {
    if (!installments || remainder === 0)
        return;
    let remaining = remainder;
    for (let i = startIndex; i < installments.length && remaining !== 0; i++) {
        const nextInstallment = installments[i];
        if (nextInstallment.status !== "DUE")
            continue;
        const updatedAmount = nextInstallment.amount - remaining;
        if (updatedAmount < 0) {
            nextInstallment.amount = 0;
            remaining = updatedAmount;
        }
        else {
            nextInstallment.amount = updatedAmount;
            remaining = 0;
        }
    }
    if (remaining !== 0) {
        throw new httpError_1.HttpError(400, "INSTALLMENT_ADJUSTMENT_FAILED", "Payment adjustment cannot be applied to future due installments.", {
            remaining
        });
    }
}
exports.feesRouter.post("/accounts/:accountId/pay", (0, requireRole_1.requireRole)("ADMIN", "TEACHER"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = PaySchema.parse(req.body);
    const account = await feeAccount_1.FeeAccountModel.findById(req.params.accountId);
    if (!account)
        throw new httpError_1.HttpError(404, "NOT_FOUND", "Fee account not found.", { accountId: req.params.accountId });
    const inst = account.installments[body.installmentIndex];
    if (!inst)
        throw new httpError_1.HttpError(400, "INVALID_INDEX", "Installment not found.", { installmentIndex: body.installmentIndex });
    if (inst.status === "PAID")
        throw new httpError_1.HttpError(400, "ALREADY_PAID", "Installment has already been paid.", { installmentIndex: body.installmentIndex });
    const remainder = body.paidAmount - inst.amount;
    inst.status = "PAID";
    inst.paidAt = (0, date_1.todayYmd)();
    inst.paidAmount = body.paidAmount;
    inst.paymentMode = body.paymentMode;
    inst.reference = body.reference;
    adjustFutureInstallmentAmounts(account.installments, body.installmentIndex + 1, remainder);
    await account.save();
    res.json({ ok: true, account });
}));
