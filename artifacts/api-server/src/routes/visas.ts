import { Router } from "express";
import { db, otherVisasTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import {
  effectiveVisaClientName,
  ensureClientAccount,
  ensureAgent,
  lockAccountNames,
  normalizeAccountName,
  resolveRenamedAccountName,
} from "../lib/clientAccounts.js";
import {
  CreateVisaBody,
  UpdateVisaBody,
  UpdateVisaParams,
  DeleteVisaParams,
  GetVisaParams,
  ListVisasQueryParams,
} from "@workspace/api-zod";

const router = Router();
router.use("/visas", requireOffice);

function toVisa(r: typeof otherVisasTable.$inferSelect) {
  const sale = Number(r.salePrice);
  const purchase = Number(r.purchasePrice);
  const received = Number(r.receivedFromClient);
  const transferred = Number(r.transferredToAgent);
  return {
    ...r,
    purchasePrice: purchase,
    salePrice: sale,
    receivedFromClient: received,
    transferredToAgent: transferred,
    clientBalance: sale - received,
    agentBalance: purchase - transferred,
    profit: sale - purchase,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/visas", async (req, res): Promise<void> => {
  const q = ListVisasQueryParams.safeParse(req.query);
  const officeId = req.session.officeId!;
  let query = db.select().from(otherVisasTable).where(eq(otherVisasTable.userId, officeId)).$dynamic();
  if (q.success) {
    const { search, visaType, agent, month, year } = q.data;
    if (search) {
      const term = `%${search}%`;
      query = query.where(
        and(
          eq(otherVisasTable.userId, officeId),
          or(
            ilike(otherVisasTable.clientName, term),
            ilike(otherVisasTable.passportNumber, term),
            ilike(otherVisasTable.requestNumber, term),
            ilike(otherVisasTable.phone, term),
            ilike(otherVisasTable.agent, term),
            ilike(otherVisasTable.client, term),
            ilike(otherVisasTable.visaType, term),
            ilike(otherVisasTable.issuingAuthority, term),
            ilike(otherVisasTable.transactionParty, term),
            ilike(otherVisasTable.sendStatus, term),
            ilike(otherVisasTable.notes, term),
            ilike(otherVisasTable.issueDate, term)
          )
        )
      );
    }
    if (visaType) query = query.where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.visaType, visaType)));
    if (agent) query = query.where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.agent, agent)));
    if (month && year) query = query.where(and(eq(otherVisasTable.userId, officeId), sql`EXTRACT(MONTH FROM ${otherVisasTable.createdAt}) = ${month}`, sql`EXTRACT(YEAR FROM ${otherVisasTable.createdAt}) = ${year}`));
  }
  const rows = await query.orderBy(sql`${otherVisasTable.createdAt} DESC`);
  res.json(rows.map(toVisa));
});

router.post("/visas", async (req, res): Promise<void> => {
  const parsed = CreateVisaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const { clientRequestId: rawRequestId, openingBalance, ...rest } = parsed.data as any;
  // Normalize name fields so statement matching (by name) never misses a
  // transaction because of stray leading/trailing spaces.
  for (const k of ["clientName", "client", "agent"]) if (typeof rest[k] === "string") rest[k] = rest[k].trim();
  // Normalize empty/blank clientRequestId to null so it never collides on the
  // unique index (empty strings would otherwise dedup to the first-ever record
  // and block all subsequent creates).
  const clientRequestId =
    typeof rawRequestId === "string" && rawRequestId.trim() !== "" ? rawRequestId : null;
  const effectiveClient = effectiveVisaClientName(rest.client, rest.clientName);
  const row = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: effectiveClient },
      { scope: "agent", name: rest.agent },
    ]);
    const canonicalClient = await resolveRenamedAccountName(tx, officeId, "client", effectiveClient);
    await lockAccountNames(tx, officeId, [{ scope: "client", name: canonicalClient }]);
    if (rest.client || canonicalClient !== effectiveClient) rest.client = await ensureClientAccount(tx, officeId, canonicalClient, openingBalance);
    rest.agent = await ensureAgent(tx, officeId, rest.agent);
    return (await tx.insert(otherVisasTable)
      .values({ ...rest, userId: officeId, clientRequestId })
      .onConflictDoNothing()
      .returning())[0] ?? null;
  });
  if (!row) {
    if (clientRequestId) {
      const [existing] = await db.select().from(otherVisasTable).where(eq(otherVisasTable.clientRequestId, clientRequestId));
      if (existing) { res.status(201).json(toVisa(existing)); return; }
    }
    res.status(409).json({ error: "Conflict" }); return;
  }
  res.status(201).json(toVisa(row));
});

router.get("/visas/:id", async (req, res): Promise<void> => {
  const params = GetVisaParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(otherVisasTable).where(and(eq(otherVisasTable.id, params.data.id), eq(otherVisasTable.userId, req.session.officeId!)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toVisa(row));
});

router.put("/visas/:id", async (req, res): Promise<void> => {
  const params = UpdateVisaParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateVisaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const values: Record<string, unknown> = { ...parsed.data };
  if (values.clientRequestId !== undefined) delete values.clientRequestId;
  const openingBalance = values.openingBalance as number | undefined;
  delete values.openingBalance;
  for (const k of ["clientName", "client", "agent"]) if (typeof values[k] === "string") values[k] = (values[k] as string).trim();
  if (Object.keys(values).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const officeId = req.session.officeId!;
  const result = await db.transaction(async (tx) => {
    // Read once to collect every possible lock, then read again after the
    // locks. A full-form update containing a name that was just renamed must
    // never restore the obsolete name.
    const [beforeLock] = await tx.select().from(otherVisasTable)
      .where(and(eq(otherVisasTable.id, params.data.id), eq(otherVisasTable.userId, officeId)));
    if (!beforeLock) return { kind: "not-found" as const, row: null };
    const changesClient = values.client !== undefined || values.clientName !== undefined;
    const requestedClient = changesClient
      ? effectiveVisaClientName(
          values.client as string | undefined ?? beforeLock.client,
          values.clientName as string | undefined ?? beforeLock.clientName,
        )
      : undefined;
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: effectiveVisaClientName(beforeLock.client, beforeLock.clientName) },
      { scope: "client", name: requestedClient },
      { scope: "agent", name: beforeLock.agent },
      { scope: "agent", name: values.agent as string | undefined },
    ]);
    const canonicalClient = requestedClient === undefined
      ? undefined
      : await resolveRenamedAccountName(tx, officeId, "client", requestedClient);
    const canonicalAgent = values.agent === undefined
      ? undefined
      : await resolveRenamedAccountName(tx, officeId, "agent", values.agent as string);
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: canonicalClient },
      { scope: "agent", name: canonicalAgent },
    ]);
    if (canonicalClient !== undefined && canonicalClient !== requestedClient) values.client = canonicalClient;
    if (canonicalAgent !== undefined) values.agent = canonicalAgent;
    const [current] = await tx.select().from(otherVisasTable)
      .where(and(eq(otherVisasTable.id, params.data.id), eq(otherVisasTable.userId, officeId)));
    if (!current) return { kind: "not-found" as const, row: null };
    const clientWasRenamed =
      effectiveVisaClientName(current.client, current.clientName) !==
      effectiveVisaClientName(beforeLock.client, beforeLock.clientName);
    const agentWasRenamed = normalizeAccountName(current.agent) !== normalizeAccountName(beforeLock.agent);
    if (
      (changesClient && clientWasRenamed && requestedClient === effectiveVisaClientName(beforeLock.client, beforeLock.clientName)) ||
      (values.agent !== undefined && agentWasRenamed && normalizeAccountName(values.agent as string) === normalizeAccountName(beforeLock.agent))
    ) {
      return { kind: "stale-name" as const, row: null };
    }
    if (values.client !== undefined) values.client = await ensureClientAccount(tx, officeId, values.client as string, openingBalance);
    if (values.agent !== undefined) values.agent = await ensureAgent(tx, officeId, values.agent as string);
    const [row] = await tx.update(otherVisasTable)
      .set(values as any)
      .where(and(eq(otherVisasTable.id, params.data.id), eq(otherVisasTable.userId, officeId)))
      .returning();
    return { kind: "ok" as const, row: row ?? null };
  });
  if (result.kind === "stale-name") { res.status(409).json({ error: "تم تغيير اسم العميل أو الوكيل، أعد تحميل المعاملة ثم حاول مجدداً" }); return; }
  if (result.kind === "not-found" || !result.row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toVisa(result.row));
});

router.delete("/visas/:id", async (req, res): Promise<void> => {
  const params = DeleteVisaParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(otherVisasTable).where(and(eq(otherVisasTable.id, params.data.id), eq(otherVisasTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

export default router;
