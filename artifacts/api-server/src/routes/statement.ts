import { Router } from "express";
import { z } from "zod";
import { db, agentsTable, agentPaymentsTable, ledgerEntriesTable, umrahClientsTable, otherVisasTable, vouchersTable, clientAccountsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireOffice, requireOwner } from "../lib/auth.js";
import {
  CreateAgentBody, UpdateAgentBody, UpdateAgentParams, DeleteAgentParams,
  GetAgentDetailsParams, CreateAgentPaymentBody, CreateAgentPaymentParams,
  DeleteAgentPaymentParams, GetClientDetailsQueryParams,
  CreateLedgerEntryBody, DeleteLedgerEntryParams,
} from "@workspace/api-zod";

const router = Router();

// Agent names open to all office users (for form pickers)
router.get("/statement/agent-names", requireOffice, async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const rows = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.userId, officeId)).orderBy(agentsTable.name);
  res.json(rows.map((r) => r.name));
});

// All other statement routes: owner/provider only
router.use("/statement/agents", requireOwner);
router.use("/statement/payments", requireOwner);
router.use("/statement/clients", requireOwner);
router.use("/statement/ledger", requireOwner);
router.use("/statement/summary", requireOwner);

async function computeAgentBalance(officeId: number, agentId: number, agentName: string) {
  const [salesRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${umrahClientsTable.salePrice}),0)::float`,
      profit: sql<number>`coalesce(sum(${umrahClientsTable.salePrice} - ${umrahClientsTable.purchasePrice}),0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(umrahClientsTable)
    .where(and(eq(umrahClientsTable.userId, officeId), eq(umrahClientsTable.agent, agentName)));

  const [salesRow2] = await db
    .select({ total: sql<number>`coalesce(sum(${otherVisasTable.salePrice}),0)::float`, profit: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.purchasePrice}),0)::float`, count: sql<number>`count(*)::int` })
    .from(otherVisasTable)
    .where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.agent, agentName)));

  const [payRow] = await db
    .select({
      paidFrom: sql<number>`coalesce(sum(case when direction='from_agent' then amount::float else 0 end),0)::float`,
      paidTo: sql<number>`coalesce(sum(case when direction='to_agent' then amount::float else 0 end),0)::float`,
    })
    .from(agentPaymentsTable)
    .where(and(eq(agentPaymentsTable.userId, officeId), eq(agentPaymentsTable.agentId, agentId)));

  const totalSales = (salesRow.total ?? 0) + (salesRow2.total ?? 0);
  const paidFrom = payRow.paidFrom ?? 0;
  const paidTo = payRow.paidTo ?? 0;
  const balance = totalSales - paidFrom + paidTo;
  const profit = (salesRow.profit ?? 0) + (salesRow2.profit ?? 0);
  const txCount = (salesRow.count ?? 0) + (salesRow2.count ?? 0);
  return { totalSales, paidFrom, paidTo, balance, profit, txCount, transactions: txCount };
}

router.get("/statement/agents", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const agents = await db.select().from(agentsTable).where(eq(agentsTable.userId, officeId)).orderBy(agentsTable.name);
  const result = await Promise.all(agents.map(async (a) => {
    const bal = await computeAgentBalance(officeId, a.id, a.name);
    return { id: a.id, name: a.name, phone: a.phone, notes: a.notes, ...bal, createdAt: a.createdAt.toISOString() };
  }));
  res.json(result);
});

router.post("/statement/agents", async (req, res): Promise<void> => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const [row] = await db.insert(agentsTable).values({ ...parsed.data, userId: officeId }).returning();
  res.status(201).json({ id: row.id, name: row.name, phone: row.phone, notes: row.notes, totalSales: 0, paidFrom: 0, paidTo: 0, balance: 0, txCount: 0, createdAt: row.createdAt.toISOString() });
});

router.put("/statement/agents/:id", async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;

  const [existing] = await db.select().from(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const oldName = existing.name;
  const newName = parsed.data.name;

  const [row] = await db.update(agentsTable).set(parsed.data).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId))).returning();

  // Re-tag transactions if name changed
  if (newName && newName !== oldName) {
    await db.update(umrahClientsTable).set({ agent: newName }).where(and(eq(umrahClientsTable.userId, officeId), eq(umrahClientsTable.agent, oldName)));
    await db.update(otherVisasTable).set({ agent: newName }).where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.agent, oldName)));
  }

  const bal = await computeAgentBalance(officeId, row.id, row.name);
  res.json({ id: row.id, name: row.name, phone: row.phone, notes: row.notes, ...bal, createdAt: row.createdAt.toISOString() });
});

router.delete("/statement/agents/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

// Original frontend contract: GET /statement/agents/:id → { agent, totals, payments, transactions }
router.get("/statement/agents/:id", async (req, res): Promise<void> => {
  const params = GetAgentDetailsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const officeId = req.session.officeId!;

  const [agent] = await db.select().from(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
  if (!agent) { res.status(404).json({ error: "Not found" }); return; }

  const bal = await computeAgentBalance(officeId, agent.id, agent.name);

  const umrahTx = await db.select({ id: umrahClientsTable.id, clientName: umrahClientsTable.clientName, issueDate: umrahClientsTable.issueDate, salePrice: umrahClientsTable.salePrice, purchasePrice: umrahClientsTable.purchasePrice, createdAt: umrahClientsTable.createdAt }).from(umrahClientsTable).where(and(eq(umrahClientsTable.userId, officeId), eq(umrahClientsTable.agent, agent.name)));
  const visaTx = await db.select({ id: otherVisasTable.id, clientName: otherVisasTable.clientName, issueDate: otherVisasTable.issueDate, salePrice: otherVisasTable.salePrice, purchasePrice: otherVisasTable.purchasePrice, createdAt: otherVisasTable.createdAt }).from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.agent, agent.name)));

  const transactions = [
    ...umrahTx.map((r) => ({ id: `u-${r.id}`, kind: "umrah", clientName: r.clientName, date: r.issueDate, sale: Number(r.salePrice), purchase: Number(r.purchasePrice), createdAt: r.createdAt.toISOString() })),
    ...visaTx.map((r) => ({ id: `v-${r.id}`, kind: "visa", clientName: r.clientName, date: r.issueDate, sale: Number(r.salePrice), purchase: Number(r.purchasePrice), createdAt: r.createdAt.toISOString() })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const payments = await db.select().from(agentPaymentsTable).where(and(eq(agentPaymentsTable.userId, officeId), eq(agentPaymentsTable.agentId, agent.id))).orderBy(agentPaymentsTable.paidAt);

  res.json({
    agent: { id: agent.id, name: agent.name, phone: agent.phone },
    totals: { count: bal.txCount, totalSales: bal.totalSales, paidFrom: bal.paidFrom, paidTo: bal.paidTo, balance: bal.balance },
    payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), direction: p.direction, paidAt: p.paidAt.toISOString(), notes: p.notes })),
    transactions,
  });
});

router.get("/statement/agents/:id/details", async (req, res): Promise<void> => {
  const params = GetAgentDetailsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const officeId = req.session.officeId!;

  const [agent] = await db.select().from(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
  if (!agent) { res.status(404).json({ error: "Not found" }); return; }

  const bal = await computeAgentBalance(officeId, agent.id, agent.name);

  const umrahTx = await db.select({ id: umrahClientsTable.id, clientName: umrahClientsTable.clientName, issueDate: umrahClientsTable.issueDate, salePrice: umrahClientsTable.salePrice, createdAt: umrahClientsTable.createdAt }).from(umrahClientsTable).where(and(eq(umrahClientsTable.userId, officeId), eq(umrahClientsTable.agent, agent.name)));
  const visaTx = await db.select({ id: otherVisasTable.id, clientName: otherVisasTable.clientName, issueDate: otherVisasTable.issueDate, salePrice: otherVisasTable.salePrice, receivedFromClient: otherVisasTable.receivedFromClient, createdAt: otherVisasTable.createdAt }).from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.agent, agent.name)));

  const transactions = [
    ...umrahTx.map((r) => ({ id: r.id, clientName: r.clientName, type: "عمرة", issueDate: r.issueDate, salePrice: Number(r.salePrice), receivedFromClient: null, createdAt: r.createdAt.toISOString() })),
    ...visaTx.map((r) => ({ id: r.id, clientName: r.clientName, type: "تأشيرة", issueDate: r.issueDate, salePrice: Number(r.salePrice), receivedFromClient: Number(r.receivedFromClient), createdAt: r.createdAt.toISOString() })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const payments = await db.select().from(agentPaymentsTable).where(and(eq(agentPaymentsTable.userId, officeId), eq(agentPaymentsTable.agentId, agent.id))).orderBy(agentPaymentsTable.paidAt);
  const vouchers = await db.select().from(vouchersTable).where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyName, agent.name))).orderBy(vouchersTable.voucherDate);

  res.json({
    agent: { id: agent.id, name: agent.name, phone: agent.phone, notes: agent.notes, ...bal, createdAt: agent.createdAt.toISOString() },
    transactions,
    payments: payments.map((p) => ({ id: p.id, agentId: p.agentId, amount: Number(p.amount), direction: p.direction, paidAt: p.paidAt.toISOString(), notes: p.notes, voucherId: null, createdAt: p.createdAt.toISOString() })),
    vouchers: vouchers.map((v) => ({ id: v.id, kind: v.kind, partyType: v.partyType, partyName: v.partyName, amount: Number(v.amount), description: v.description, voucherDate: v.voucherDate.toISOString(), agentPaymentId: v.agentPaymentId, createdAt: v.createdAt.toISOString() })),
  });
});

router.post("/statement/agents/:id/payments", async (req, res): Promise<void> => {
  const params = CreateAgentPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CreateAgentPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;

  const [agent] = await db.select().from(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const { createVoucher: doCreateVoucher, paidAt, ...rest } = parsed.data as any;
  const [payment] = await db.insert(agentPaymentsTable).values({
    ...rest,
    userId: officeId,
    agentId: agent.id,
    paidAt: paidAt ? new Date(paidAt) : new Date(),
  }).returning();

  let voucherId: number | null = null;
  if (doCreateVoucher) {
    const kind = rest.direction === "from_agent" ? "receipt" : "payment";
    const [v] = await db.insert(vouchersTable).values({
      userId: officeId,
      kind,
      partyType: "agent",
      partyName: agent.name,
      amount: rest.amount,
      description: rest.notes ?? null,
      voucherDate: new Date(),
      agentPaymentId: payment.id,
    }).returning();
    voucherId = v.id;
  }

  res.status(201).json({ id: payment.id, agentId: payment.agentId, amount: Number(payment.amount), direction: payment.direction, paidAt: payment.paidAt.toISOString(), notes: payment.notes, voucherId, createdAt: payment.createdAt.toISOString() });
});

router.delete("/statement/payments/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(agentPaymentsTable).where(and(eq(agentPaymentsTable.id, params.data.id), eq(agentPaymentsTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

router.post("/statement/clients", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const body = z.object({
    clientName: z.string().trim().min(1),
    phone: z.string().trim().nullish(),
    notes: z.string().trim().nullish(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [existing] = await db.select().from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), eq(clientAccountsTable.clientName, body.data.clientName)));
  if (existing) { res.status(409).json({ error: "يوجد حساب عميل بهذا الاسم مسبقاً" }); return; }

  const [row] = await db.insert(clientAccountsTable).values({
    userId: officeId,
    clientName: body.data.clientName,
    phone: body.data.phone ?? null,
    notes: body.data.notes ?? null,
  }).returning();
  res.status(201).json({ id: row.id, clientName: row.clientName, phone: row.phone, notes: row.notes });
});

router.delete("/statement/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(clientAccountsTable)
    .where(and(eq(clientAccountsTable.id, id), eq(clientAccountsTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

router.get("/statement/clients", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;

  const manualRows = await db.select().from(clientAccountsTable)
    .where(eq(clientAccountsTable.userId, officeId));

  const visaRows = await db
    .select({
      clientName: otherVisasTable.clientName,
      phone: otherVisasTable.phone,
      totalSales: sql<number>`coalesce(sum(${otherVisasTable.salePrice}),0)::float`,
      totalReceived: sql<number>`coalesce(sum(${otherVisasTable.receivedFromClient}),0)::float`,
      balance: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient}),0)::float`,
      txCount: sql<number>`count(*)::int`,
    })
    .from(otherVisasTable)
    .where(eq(otherVisasTable.userId, officeId))
    .groupBy(otherVisasTable.clientName, otherVisasTable.phone);

  const byName = new Map<string, any>();
  for (const r of visaRows) {
    const key = r.clientName;
    const prev = byName.get(key);
    if (prev) {
      prev.totalSales += r.totalSales; prev.totalReceived += r.totalReceived;
      prev.balance += r.balance; prev.txCount += r.txCount;
      prev.phone = prev.phone || r.phone;
    } else {
      byName.set(key, { clientName: r.clientName, phone: r.phone, totalSales: r.totalSales, totalReceived: r.totalReceived, balance: r.balance, txCount: r.txCount, manualId: null });
    }
  }
  for (const m of manualRows) {
    const prev = byName.get(m.clientName);
    if (prev) { prev.manualId = m.id; prev.phone = prev.phone || m.phone; }
    else byName.set(m.clientName, { clientName: m.clientName, phone: m.phone, totalSales: 0, totalReceived: 0, balance: 0, txCount: 0, manualId: m.id });
  }

  res.json([...byName.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, "ar")));
});

router.get("/statement/clients/details", async (req, res): Promise<void> => {
  const q = GetClientDetailsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "name required" }); return; }
  const officeId = req.session.officeId!;
  const name = q.data.name;

  const [totals] = await db.select({
    totalSales: sql<number>`coalesce(sum(${otherVisasTable.salePrice}),0)::float`,
    totalReceived: sql<number>`coalesce(sum(${otherVisasTable.receivedFromClient}),0)::float`,
    balance: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient}),0)::float`,
    txCount: sql<number>`count(*)::int`,
    phone: sql<string | null>`max(${otherVisasTable.phone})`,
  }).from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.clientName, name)));

  const txRows = await db.select().from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), eq(otherVisasTable.clientName, name))).orderBy(otherVisasTable.createdAt);
  const vouchers = await db.select().from(vouchersTable).where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyName, name))).orderBy(vouchersTable.voucherDate);

  res.json({
    account: { clientName: name, phone: totals.phone, totalSales: totals.totalSales, totalReceived: totals.totalReceived, balance: totals.balance, txCount: totals.txCount },
    transactions: txRows.map((r) => ({ id: r.id, clientName: r.clientName, type: r.visaType, issueDate: r.issueDate, salePrice: Number(r.salePrice), receivedFromClient: Number(r.receivedFromClient), createdAt: r.createdAt.toISOString() })),
    vouchers: vouchers.map((v) => ({ id: v.id, kind: v.kind, partyType: v.partyType, partyName: v.partyName, amount: Number(v.amount), description: v.description, voucherDate: v.voucherDate.toISOString(), agentPaymentId: v.agentPaymentId, createdAt: v.createdAt.toISOString() })),
  });
});

router.get("/statement/ledger", async (req, res): Promise<void> => {
  const rows = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.userId, req.session.officeId!)).orderBy(ledgerEntriesTable.entryDate);
  res.json(rows.map((r) => ({ id: r.id, type: r.type, amount: Number(r.amount), description: r.description, entryDate: r.entryDate.toISOString(), createdAt: r.createdAt.toISOString() })));
});

router.post("/statement/ledger", async (req, res): Promise<void> => {
  const parsed = CreateLedgerEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const { entryDate, ...rest } = parsed.data as any;
  const [row] = await db.insert(ledgerEntriesTable).values({ ...rest, userId: officeId, entryDate: entryDate ? new Date(entryDate) : new Date() }).returning();
  res.status(201).json({ id: row.id, type: row.type, amount: Number(row.amount), description: row.description, entryDate: row.entryDate.toISOString(), createdAt: row.createdAt.toISOString() });
});

router.delete("/statement/ledger/:id", async (req, res): Promise<void> => {
  const params = DeleteLedgerEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(ledgerEntriesTable).where(and(eq(ledgerEntriesTable.id, params.data.id), eq(ledgerEntriesTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

router.get("/statement/summary", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;

  const txRows = await db.select({
    month: sql<string>`to_char(${umrahClientsTable.createdAt}, 'YYYY-MM')`,
    sales: sql<number>`coalesce(sum(${umrahClientsTable.salePrice}),0)::float`,
    profit: sql<number>`coalesce(sum(${umrahClientsTable.salePrice} - ${umrahClientsTable.purchasePrice}),0)::float`,
    count: sql<number>`count(*)::int`,
  }).from(umrahClientsTable).where(eq(umrahClientsTable.userId, officeId)).groupBy(sql`to_char(${umrahClientsTable.createdAt}, 'YYYY-MM')`);

  const visaTxRows = await db.select({
    month: sql<string>`to_char(${otherVisasTable.createdAt}, 'YYYY-MM')`,
    sales: sql<number>`coalesce(sum(${otherVisasTable.salePrice}),0)::float`,
    profit: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.purchasePrice}),0)::float`,
    count: sql<number>`count(*)::int`,
  }).from(otherVisasTable).where(eq(otherVisasTable.userId, officeId)).groupBy(sql`to_char(${otherVisasTable.createdAt}, 'YYYY-MM')`);

  const ledgerRows = await db.select({
    month: sql<string>`to_char(${ledgerEntriesTable.entryDate}, 'YYYY-MM')`,
    income: sql<number>`coalesce(sum(case when type='income' then amount::float else 0 end),0)::float`,
    expense: sql<number>`coalesce(sum(case when type='expense' then amount::float else 0 end),0)::float`,
  }).from(ledgerEntriesTable).where(eq(ledgerEntriesTable.userId, officeId)).groupBy(sql`to_char(${ledgerEntriesTable.entryDate}, 'YYYY-MM')`);

  type MonthAgg = { txCount: number; txSales: number; txProfit: number; otherIncome: number; expenses: number };
  const monthMap = new Map<string, MonthAgg>();
  const getMonth = (m: string): MonthAgg => {
    let e = monthMap.get(m);
    if (!e) { e = { txCount: 0, txSales: 0, txProfit: 0, otherIncome: 0, expenses: 0 }; monthMap.set(m, e); }
    return e;
  };
  for (const r of txRows) { const e = getMonth(r.month); e.txCount += r.count; e.txSales += r.sales; e.txProfit += r.profit; }
  for (const r of visaTxRows) { const e = getMonth(r.month); e.txCount += r.count; e.txSales += r.sales; e.txProfit += r.profit; }
  for (const r of ledgerRows) { const e = getMonth(r.month); e.otherIncome += r.income; e.expenses += r.expense; }

  const result = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => {
      const net = m.txProfit + m.otherIncome - m.expenses;
      // `income`/`expense` retained for the generated StatementMonth shape.
      const income = m.txSales + m.otherIncome;
      return {
        month,
        txCount: m.txCount,
        txSales: m.txSales,
        txProfit: m.txProfit,
        otherIncome: m.otherIncome,
        expenses: m.expenses,
        income,
        expense: m.expenses,
        net,
      };
    });

  res.json(result);
});

export default router;
