import { Router } from "express";
import { z } from "zod";
import { db, vouchersTable, agentsTable, agentPaymentsTable, clientAccountsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { ensureClientAccount, ensureAgent } from "../lib/clientAccounts.js";
import { requireOffice } from "../lib/auth.js";
import { DeleteVoucherParams, GetVoucherParams, ListVouchersQueryParams } from "@workspace/api-zod";

const router = Router();
// Available to all office users — subs are full-featured for daily work.
router.use("/vouchers", requireOffice);

function toVoucher(v: typeof vouchersTable.$inferSelect) {
  return { id: v.id, kind: v.kind, partyType: v.partyType, partyName: v.partyName, amount: Number(v.amount), description: v.description, voucherDate: v.voucherDate.toISOString(), agentPaymentId: v.agentPaymentId, createdAt: v.createdAt.toISOString() };
}

const VoucherEditBody = z.object({
  kind: z.enum(["receipt", "payment"]),
  partyType: z.enum(["agent", "client", "other"]),
  partyName: z.string().trim().min(1, "الطرف مطلوب"),
  amount: z.number().finite()
    .refine((value) => value > 0, "المبلغ يجب أن يكون أكبر من صفر")
    .refine(
      (value) => value <= 9_999_999_999.99 && Math.abs(Math.round(value * 100) - value * 100) < 0.000001,
      "المبلغ يجب أن لا يتجاوز 9,999,999,999.99 وبحد أقصى منزلتين عشريتين",
    ),
  description: z.string().trim().nullish(),
  voucherDate: z.string().optional(),
});

function parseVoucherDate(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ السند غير صحيح");
  const day = value?.slice(0, 10);
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && date.toISOString().slice(0, 10) !== day) {
    throw new Error("تاريخ السند غير صحيح");
  }
  return date;
}

router.get("/vouchers", async (req, res): Promise<void> => {
  const q = ListVouchersQueryParams.safeParse(req.query);
  const officeId = req.session.officeId!;
  let rows = await db.select().from(vouchersTable).where(eq(vouchersTable.userId, officeId)).orderBy(vouchersTable.voucherDate);
  if (q.success) {
    if (q.data.kind) rows = rows.filter((r) => r.kind === q.data.kind);
    if (q.data.party) rows = rows.filter((r) => r.partyName.includes(q.data.party!));
  }
  res.json(rows.map(toVoucher));
});

router.post("/vouchers", async (req, res): Promise<void> => {
  const parsed = VoucherEditBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const { voucherDate, ...rest } = parsed.data;
  let date: Date;
  try { date = parseVoucherDate(voucherDate); } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  // ضمان الترابط: أي سند مرتبط بوكيل أو عميل يُنشئ حسابه تلقائياً إن لم يوجد
  if (rest.partyType === "agent") await ensureAgent(officeId, rest.partyName);
  if (rest.partyType === "client") await ensureClientAccount(officeId, rest.partyName, undefined);
  const [row] = await db.insert(vouchersTable).values({ ...rest, amount: String(rest.amount), userId: officeId, voucherDate: date }).returning();
  res.status(201).json(toVoucher(row));
});

router.put("/vouchers/:id", async (req, res): Promise<void> => {
  const params = GetVoucherParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = VoucherEditBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  let date: Date;
  try { date = parseVoucherDate(parsed.data.voucherDate); } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const officeId = req.session.officeId!;

  try {
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(vouchersTable).where(and(eq(vouchersTable.id, params.data.id), eq(vouchersTable.userId, officeId)));
      if (!existing) return null;

      // A voucher linked to an agent payment is the payment's accounting view.
      // Keep both rows synchronized, and do not allow it to become a client or
      // unrelated voucher while retaining the payment foreign key.
      let agentPayment: { id: number } | null = null;
      if (existing.agentPaymentId != null) {
        if (parsed.data.partyType !== "agent") {
          throw new Error("لا يمكن تحويل سند دفعة وكيل إلى طرف آخر");
        }
        [agentPayment] = await tx.select({ id: agentPaymentsTable.id })
          .from(agentPaymentsTable)
          .where(and(eq(agentPaymentsTable.id, existing.agentPaymentId), eq(agentPaymentsTable.userId, officeId)));
        if (!agentPayment) throw new Error("دفعة الوكيل المرتبطة غير موجودة");
      }

      if (parsed.data.partyType === "agent") {
        const [agent] = await tx.select({ id: agentsTable.id }).from(agentsTable)
          .where(and(eq(agentsTable.userId, officeId), sql`btrim(${agentsTable.name}) = btrim(${parsed.data.partyName})`));
        if (!agent) throw new Error("الوكيل غير موجود");
        if (agentPayment) {
          await tx.update(agentPaymentsTable).set({
            agentId: agent.id,
            amount: String(parsed.data.amount),
            direction: parsed.data.kind === "receipt" ? "from_agent" : "to_agent",
            paidAt: date,
            notes: parsed.data.description ?? null,
          }).where(and(eq(agentPaymentsTable.id, agentPayment.id), eq(agentPaymentsTable.userId, officeId)));
        }
      } else if (parsed.data.partyType === "client") {
        const [client] = await tx.select({ id: clientAccountsTable.id }).from(clientAccountsTable)
          .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${parsed.data.partyName})`));
        if (!client) {
          await tx.insert(clientAccountsTable).values({ userId: officeId, clientName: parsed.data.partyName, openingBalance: "0" });
        }
      }

      const [updated] = await tx.update(vouchersTable).set({
        kind: parsed.data.kind,
        partyType: parsed.data.partyType,
        partyName: parsed.data.partyName,
        amount: String(parsed.data.amount),
        description: parsed.data.description ?? null,
        voucherDate: date,
      }).where(and(eq(vouchersTable.id, existing.id), eq(vouchersTable.userId, officeId))).returning();
      return updated;
    });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(toVoucher(row));
  } catch (error) {
    res.status(400).json({ error: (error as Error).message || "تعذر تعديل السند" });
  }
});

router.get("/vouchers/:id", async (req, res): Promise<void> => {
  const params = GetVoucherParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(vouchersTable).where(and(eq(vouchersTable.id, params.data.id), eq(vouchersTable.userId, req.session.officeId!)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toVoucher(row));
});

router.delete("/vouchers/:id", async (req, res): Promise<void> => {
  const params = DeleteVoucherParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(vouchersTable).where(and(eq(vouchersTable.id, params.data.id), eq(vouchersTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

export default router;
