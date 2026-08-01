import { Router } from "express";
import { db, umrahClientsTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import { ensureClientAccount, ensureAgent } from "../lib/clientAccounts.js";
import {
  CreateUmrahClientBody,
  UpdateUmrahClientBody,
  UpdateUmrahClientParams,
  DeleteUmrahClientParams,
  GetUmrahClientParams,
  ListUmrahClientsQueryParams,
} from "@workspace/api-zod";

const router = Router();
router.use("/umrah", requireOffice);

function computeStatus(client: { stayDuration: number; entryDate: string | Date | null }): string {
  if (!client.entryDate) return "خارج المملكة";
  const entry = new Date(client.entryDate);
  if (isNaN(entry.getTime())) return "خارج المملكة";
  const daysInside = Math.floor((Date.now() - entry.getTime()) / 86400000);
  return daysInside < client.stayDuration ? "داخل المملكة" : "خارج المملكة";
}

router.get("/umrah", async (req, res): Promise<void> => {
  const q = ListUmrahClientsQueryParams.safeParse(req.query);
  const officeId = req.session.officeId!;

  let query = db.select().from(umrahClientsTable).where(eq(umrahClientsTable.userId, officeId)).$dynamic();

  if (q.success) {
    const { search, agent, month, year } = q.data;
    if (search) {
      const term = `%${search}%`;
      query = query.where(
        and(
          eq(umrahClientsTable.userId, officeId),
          or(
            ilike(umrahClientsTable.clientName, term),
            ilike(umrahClientsTable.passportNumber, term),
            ilike(umrahClientsTable.phone, term),
            ilike(umrahClientsTable.agent, term),
            ilike(umrahClientsTable.client, term),
            ilike(umrahClientsTable.issuingAuthority, term),
            ilike(umrahClientsTable.transactionParty, term),
            ilike(umrahClientsTable.sendStatus, term),
            ilike(umrahClientsTable.notes, term),
            ilike(umrahClientsTable.issueDate, term),
            ilike(sql`${umrahClientsTable.entryDate}::text`, term)
          )
        )
      );
    }
    if (agent) query = query.where(and(eq(umrahClientsTable.userId, officeId), eq(umrahClientsTable.agent, agent)));
    if (month && year) {
      query = query.where(
        and(
          eq(umrahClientsTable.userId, officeId),
          sql`EXTRACT(MONTH FROM ${umrahClientsTable.createdAt}) = ${month}`,
          sql`EXTRACT(YEAR FROM ${umrahClientsTable.createdAt}) = ${year}`
        )
      );
    }
  }

  const rows = await query.orderBy(sql`${umrahClientsTable.createdAt} DESC`);
  const result = rows.map((r) => ({
    ...r,
    purchasePrice: Number(r.purchasePrice),
    salePrice: Number(r.salePrice),
    profit: Number(r.salePrice) - Number(r.purchasePrice),
    status: computeStatus(r),
    entryDate: r.entryDate ? r.entryDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(result);
});

router.post("/umrah", async (req, res): Promise<void> => {
  const parsed = CreateUmrahClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const officeId = req.session.officeId!;
  const { clientRequestId: rawRequestId, entryDate, openingBalance, ...rest } = parsed.data as any;
  await ensureClientAccount(officeId, rest.client, openingBalance);
  await ensureAgent(officeId, rest.agent);
  // Normalize empty/blank clientRequestId to null so it never collides on the
  // unique index (empty strings would otherwise dedup to the first-ever record
  // and block all subsequent creates).
  const clientRequestId =
    typeof rawRequestId === "string" && rawRequestId.trim() !== "" ? rawRequestId : null;

  const [row] = await db
    .insert(umrahClientsTable)
    .values({
      ...rest,
      userId: officeId,
      entryDate: entryDate ? new Date(entryDate) : null,
      clientRequestId,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // conflict = idempotent: return existing (only when a real request id was sent)
    if (clientRequestId) {
      const [existing] = await db.select().from(umrahClientsTable)
        .where(eq(umrahClientsTable.clientRequestId, clientRequestId));
      if (existing) {
        res.status(201).json({ ...existing, purchasePrice: Number(existing.purchasePrice), salePrice: Number(existing.salePrice), profit: Number(existing.salePrice) - Number(existing.purchasePrice), status: computeStatus(existing), entryDate: existing.entryDate ? existing.entryDate.toISOString() : null, createdAt: existing.createdAt.toISOString() });
        return;
      }
    }
    res.status(409).json({ error: "Conflict" });
    return;
  }

  res.status(201).json({ ...row, purchasePrice: Number(row.purchasePrice), salePrice: Number(row.salePrice), profit: Number(row.salePrice) - Number(row.purchasePrice), status: computeStatus(row), entryDate: row.entryDate ? row.entryDate.toISOString() : null, createdAt: row.createdAt.toISOString() });
});

router.get("/umrah/:id", async (req, res): Promise<void> => {
  const params = GetUmrahClientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(umrahClientsTable).where(and(eq(umrahClientsTable.id, params.data.id), eq(umrahClientsTable.userId, req.session.officeId!)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, purchasePrice: Number(row.purchasePrice), salePrice: Number(row.salePrice), profit: Number(row.salePrice) - Number(row.purchasePrice), status: computeStatus(row), entryDate: row.entryDate ? row.entryDate.toISOString() : null, createdAt: row.createdAt.toISOString() });
});

router.put("/umrah/:id", async (req, res): Promise<void> => {
  const params = UpdateUmrahClientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateUmrahClientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const values: Record<string, unknown> = { ...parsed.data };
  if (values.entryDate) values.entryDate = new Date(values.entryDate as string);
  if (values.clientRequestId !== undefined) delete values.clientRequestId;
  const openingBalance = values.openingBalance as number | undefined;
  delete values.openingBalance;
  await ensureClientAccount(req.session.officeId!, values.client as string | undefined, openingBalance);
  await ensureAgent(req.session.officeId!, values.agent as string | undefined);
  if (Object.keys(values).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [row] = await db.update(umrahClientsTable).set(values as any).where(and(eq(umrahClientsTable.id, params.data.id), eq(umrahClientsTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, purchasePrice: Number(row.purchasePrice), salePrice: Number(row.salePrice), profit: Number(row.salePrice) - Number(row.purchasePrice), status: computeStatus(row), entryDate: row.entryDate ? row.entryDate.toISOString() : null, createdAt: row.createdAt.toISOString() });
});

router.delete("/umrah/:id", async (req, res): Promise<void> => {
  const params = DeleteUmrahClientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(umrahClientsTable).where(and(eq(umrahClientsTable.id, params.data.id), eq(umrahClientsTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

export default router;
