import { Router } from "express";
import { z } from "zod";
import { db, vouchersTable, agentsTable, agentPaymentsTable, clientAccountsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ensureClientAccount,
  ensureAgent,
  lockAccountNames,
  normalizeAccountName,
  resolveRenamedAccountName,
} from "../lib/clientAccounts.js";
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
  const row = await db.transaction(async (tx) => {
    const names = rest.partyType === "agent"
      ? [{ scope: "agent" as const, name: rest.partyName }]
      : rest.partyType === "client"
        ? [{ scope: "client" as const, name: rest.partyName }]
        : [];
    await lockAccountNames(tx, officeId, names);
    // ضمان الترابط: أي سند مرتبط بوكيل أو عميل يُنشئ حسابه تلقائياً إن لم يوجد
    if (rest.partyType === "agent") rest.partyName = await ensureAgent(tx, officeId, rest.partyName);
    if (rest.partyType === "client") rest.partyName = await ensureClientAccount(tx, officeId, rest.partyName, undefined);
    return (await tx.insert(vouchersTable)
      .values({ ...rest, amount: String(rest.amount), userId: officeId, voucherDate: date })
      .returning())[0];
  });
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
    const result = await db.transaction(async (tx) => {
      const [beforeLock] = await tx.select().from(vouchersTable).where(and(eq(vouchersTable.id, params.data.id), eq(vouchersTable.userId, officeId)));
      if (!beforeLock) return { kind: "not-found" as const, row: null };
      const names = [
        beforeLock.partyType === "agent" ? { scope: "agent" as const, name: beforeLock.partyName } : null,
        beforeLock.partyType === "client" ? { scope: "client" as const, name: beforeLock.partyName } : null,
        parsed.data.partyType === "agent" ? { scope: "agent" as const, name: parsed.data.partyName } : null,
        parsed.data.partyType === "client" ? { scope: "client" as const, name: parsed.data.partyName } : null,
      ].filter((name): name is { scope: "agent" | "client"; name: string } => name !== null);
      await lockAccountNames(tx, officeId, names);
      const canonicalPartyName = parsed.data.partyType === "agent" || parsed.data.partyType === "client"
        ? await resolveRenamedAccountName(tx, officeId, parsed.data.partyType, parsed.data.partyName)
        : parsed.data.partyName;
      if (parsed.data.partyType === "agent" || parsed.data.partyType === "client") {
        await lockAccountNames(tx, officeId, [{ scope: parsed.data.partyType, name: canonicalPartyName }]);
      }
      const [existing] = await tx.select().from(vouchersTable).where(and(eq(vouchersTable.id, params.data.id), eq(vouchersTable.userId, officeId)));
      if (!existing) return { kind: "not-found" as const, row: null };
      if (
        (existing.partyType !== beforeLock.partyType || normalizeAccountName(existing.partyName) !== normalizeAccountName(beforeLock.partyName)) &&
        parsed.data.partyType === beforeLock.partyType &&
        normalizeAccountName(canonicalPartyName) === normalizeAccountName(beforeLock.partyName)
      ) {
        return { kind: "stale-name" as const, row: null };
      }

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
          .where(and(eq(agentsTable.userId, officeId), sql`btrim(${agentsTable.name}) = btrim(${canonicalPartyName})`));
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
        await ensureClientAccount(tx, officeId, canonicalPartyName, undefined);
      }

      const [updated] = await tx.update(vouchersTable).set({
        kind: parsed.data.kind,
        partyType: parsed.data.partyType,
        partyName: canonicalPartyName,
        amount: String(parsed.data.amount),
        description: parsed.data.description ?? null,
        voucherDate: date,
      }).where(and(eq(vouchersTable.id, existing.id), eq(vouchersTable.userId, officeId))).returning();
      return { kind: "ok" as const, row: updated };
    });
    if (result.kind === "stale-name") { res.status(409).json({ error: "تم تغيير اسم العميل أو الوكيل، أعد تحميل السند ثم حاول مجدداً" }); return; }
    if (result.kind === "not-found" || !result.row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(toVoucher(result.row));
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
