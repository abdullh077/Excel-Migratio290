import { Router } from "express";
import { db, vouchersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import { CreateVoucherBody, DeleteVoucherParams, GetVoucherParams, ListVouchersQueryParams } from "@workspace/api-zod";

const router = Router();
// Available to all office users — subs are full-featured for daily work.
router.use("/vouchers", requireOffice);

function toVoucher(v: typeof vouchersTable.$inferSelect) {
  return { id: v.id, kind: v.kind, partyType: v.partyType, partyName: v.partyName, amount: Number(v.amount), description: v.description, voucherDate: v.voucherDate.toISOString(), agentPaymentId: v.agentPaymentId, createdAt: v.createdAt.toISOString() };
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
  const parsed = CreateVoucherBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const { voucherDate, ...rest } = parsed.data as any;
  const [row] = await db.insert(vouchersTable).values({ ...rest, userId: officeId, voucherDate: voucherDate ? new Date(voucherDate) : new Date() }).returning();
  res.status(201).json(toVoucher(row));
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
