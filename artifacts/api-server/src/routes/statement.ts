import { Router } from "express";
import { z } from "zod";
import { db, agentsTable, agentPaymentsTable, ledgerEntriesTable, umrahClientsTable, otherVisasTable, vouchersTable, clientAccountsTable } from "@workspace/db";
import { eq, and, ne, isNull, sql } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import {
  isRetiredAccountName,
  lockAccountNames,
  recordAccountRename,
  resolveRenamedAccountName,
} from "../lib/clientAccounts.js";
import {
  UpdateAgentParams, DeleteAgentParams,
  GetAgentDetailsParams, CreateAgentPaymentBody, CreateAgentPaymentParams,
  DeleteAgentPaymentParams, GetClientDetailsQueryParams,
  DeleteLedgerEntryParams,
} from "@workspace/api-zod";

const router = Router();

const MAX_MONEY = 9_999_999_999.99;
const moneyNumber = z.number().finite().refine(
  (value) => Math.abs(value) <= MAX_MONEY && Math.abs(Math.round(value * 100) - value * 100) < 0.000001,
  "المبلغ يجب أن لا يتجاوز 9,999,999,999.99 وبحد أقصى منزلتين عشريتين",
);
const positiveMoney = moneyNumber.refine((value) => value > 0, "المبلغ يجب أن يكون أكبر من صفر");

const AgentEditBody = z.object({
  name: z.string().trim().min(2, "اسم الوكيل يجب أن يتكون من حرفين على الأقل"),
  phone: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  openingBalance: moneyNumber.optional(),
});

const AgentCreateBody = AgentEditBody.extend({
  clientRequestId: z.string().trim().optional(),
});

const ClientCreateBody = z.object({
  clientName: z.string().trim().min(1),
  phone: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  clientRequestId: z.string().trim().optional(),
});

function normalizeRequestId(raw: unknown): string | null {
  // Empty offline-outbox ids must not share the unique key (would otherwise
  // dedup to the first-ever record and block all subsequent creates).
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

function agentResponse(row: typeof agentsTable.$inferSelect, bal: { totalPurchases: number; transferred: number; paidFrom: number; paidTo: number; balance: number; txCount: number }) {
  return { id: row.id, name: row.name, phone: row.phone, notes: row.notes, openingBalance: Number(row.openingBalance) || 0, ...bal, createdAt: row.createdAt.toISOString() };
}

const ClientEditBody = z.object({
  oldName: z.string().trim().min(1),
  newName: z.string().trim().min(2, "اسم العميل يجب أن يتكون من حرفين على الأقل"),
  phone: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  openingBalance: moneyNumber.optional(),
});

const LedgerEditBody = z.object({
  type: z.enum(["income", "expense"]),
  amount: positiveMoney,
  description: z.string().trim().min(1, "البيان مطلوب"),
  entryDate: z.string().optional(),
  clientRequestId: z.string().trim().optional(),
});

function parseDate(value: string | undefined, label: string): Date {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`${label} غير صحيح`);
  const day = value?.slice(0, 10);
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && date.toISOString().slice(0, 10) !== day) {
    throw new Error(`${label} غير صحيح`);
  }
  return date;
}

// Agent names open to all office users (for form pickers)
router.get("/statement/agent-names", requireOffice, async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const rows = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.userId, officeId)).orderBy(agentsTable.name);
  res.json(rows.map((r) => r.name));
});

// Statement routes are available to all office users (owner, provider, subs) —
// sub accounts are full-featured except office management (see routes/subs.ts).
router.use("/statement/agents", requireOffice);
router.use("/statement/payments", requireOffice);
router.use("/statement/clients", requireOffice);
router.use("/statement/ledger", requireOffice);
router.use("/statement/summary", requireOffice);
router.use("/statement/opening", requireOffice);

async function computeAgentBalance(officeId: number, agentId: number, agentName: string, openingBalance = 0) {
  // الوكيل مورد: يُحسب حسابه على أساس الشراء (ما ندين له به) — البيع والربح لا يظهران في كشفه.
  // المطابقة بالاسم مع تجاهل الفراغات الطرفية حتى لا تسقط معاملات كُتب اسم الوكيل فيها بمسافة زائدة.
  const [purchRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${umrahClientsTable.purchasePrice}),0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(umrahClientsTable)
    .where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.agent}) = btrim(${agentName})`));

  const [purchRow2] = await db
    .select({
      total: sql<number>`coalesce(sum(${otherVisasTable.purchasePrice}),0)::float`,
      transferred: sql<number>`coalesce(sum(${otherVisasTable.transferredToAgent}),0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(otherVisasTable)
    .where(and(eq(otherVisasTable.userId, officeId), sql`btrim(${otherVisasTable.agent}) = btrim(${agentName})`));

  const [payRow] = await db
    .select({
      paidFrom: sql<number>`coalesce(sum(case when direction='from_agent' then amount::float else 0 end),0)::float`,
      paidTo: sql<number>`coalesce(sum(case when direction='to_agent' then amount::float else 0 end),0)::float`,
    })
    .from(agentPaymentsTable)
    .where(and(eq(agentPaymentsTable.userId, officeId), eq(agentPaymentsTable.agentId, agentId)));

  // Standalone agent vouchers (not linked to an agent payment) count as
  // movements too: receipt = قبضنا من الوكيل (credit), payment = صرفنا له (debit).
  const [voucherRow] = await db
    .select({
      receipts: sql<number>`coalesce(sum(case when kind='receipt' then amount::float else 0 end),0)::float`,
      payments: sql<number>`coalesce(sum(case when kind='payment' then amount::float else 0 end),0)::float`,
    })
    .from(vouchersTable)
    .where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyType, "agent"), sql`btrim(${vouchersTable.partyName}) = btrim(${agentName})`, isNull(vouchersTable.agentPaymentId)));

  const totalPurchases = (purchRow.total ?? 0) + (purchRow2.total ?? 0);
  const transferred = purchRow2.transferred ?? 0;
  const paidFrom = (payRow.paidFrom ?? 0) + (voucherRow.receipts ?? 0);
  const paidTo = (payRow.paidTo ?? 0) + (voucherRow.payments ?? 0);
  // موجب = عليه (للمكتب)، سالب = له (الباقي للوكيل).
  const balance = openingBalance + transferred + paidTo - totalPurchases - paidFrom;
  const txCount = (purchRow.count ?? 0) + (purchRow2.count ?? 0);
  return { totalPurchases, transferred, paidFrom, paidTo, balance, txCount, transactions: txCount };
}

router.get("/statement/agents", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const agents = await db.select().from(agentsTable).where(eq(agentsTable.userId, officeId)).orderBy(agentsTable.name);
  const result = await Promise.all(agents.map(async (a) => {
    const opening = Number(a.openingBalance) || 0;
    const bal = await computeAgentBalance(officeId, a.id, a.name, opening);
    return { id: a.id, name: a.name, phone: a.phone, notes: a.notes, openingBalance: opening, ...bal, createdAt: a.createdAt.toISOString() };
  }));
  res.json(result);
});

router.post("/statement/agents", async (req, res): Promise<void> => {
  const parsed = AgentCreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const clientRequestId = normalizeRequestId(parsed.data.clientRequestId);
  const row = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "agent", name: parsed.data.name }]);
    if (await resolveRenamedAccountName(tx, officeId, "agent", parsed.data.name) !== parsed.data.name) return null;
    const duplicate = await tx.select({ id: agentsTable.id }).from(agentsTable)
      .where(and(eq(agentsTable.userId, officeId), sql`btrim(${agentsTable.name}) = btrim(${parsed.data.name})`));
    if (duplicate.length) return null;
    return (await tx.insert(agentsTable).values({
      userId: officeId,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
      openingBalance: String(parsed.data.openingBalance ?? 0),
      clientRequestId,
    }).onConflictDoNothing().returning())[0] ?? null;
  });
  if (!row) {
    // A retried offline create can hit either the name-uniqueness check or the
    // clientRequestId unique index above — in both cases, if this exact
    // request already succeeded, return the existing record instead of a
    // permanent conflict so the outbox never reports a false sync failure.
    if (clientRequestId) {
      const [existing] = await db.select().from(agentsTable)
        .where(and(eq(agentsTable.userId, officeId), eq(agentsTable.clientRequestId, clientRequestId)));
      if (existing) {
        const bal = await computeAgentBalance(officeId, existing.id, existing.name, Number(existing.openingBalance) || 0);
        res.status(201).json(agentResponse(existing, bal));
        return;
      }
    }
    res.status(409).json({ error: "يوجد وكيل بهذا الاسم مسبقاً" }); return;
  }
  res.status(201).json({ id: row.id, name: row.name, phone: row.phone, notes: row.notes, openingBalance: Number(row.openingBalance) || 0, totalPurchases: 0, transferred: 0, paidFrom: 0, paidTo: 0, balance: Number(row.openingBalance) || 0, txCount: 0, createdAt: row.createdAt.toISOString() });
});

router.put("/statement/agents/:id", async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AgentEditBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;

  const newName = parsed.data.name;

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"agent-id:" + officeId + ":" + params.data.id}))`);
    const [existing] = await tx.select().from(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
    if (!existing) return { kind: "not-found" as const, row: null };
    const oldName = existing.name;
    await lockAccountNames(tx, officeId, [
      { scope: "agent", name: oldName },
      { scope: "agent", name: newName },
    ]);
    if (await isRetiredAccountName(tx, officeId, "agent", newName)) {
      return { kind: "conflict" as const, row: null };
    }
    const duplicate = await tx.select({ id: agentsTable.id }).from(agentsTable)
      .where(and(
        eq(agentsTable.userId, officeId),
        ne(agentsTable.id, params.data.id),
        sql`btrim(${agentsTable.name}) = btrim(${newName})`,
      ));
    if (duplicate.length) return { kind: "conflict" as const, row: null };
    const [updated] = await tx.update(agentsTable).set({
      name: newName,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
      ...(parsed.data.openingBalance === undefined ? {} : { openingBalance: String(parsed.data.openingBalance) }),
    }).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId))).returning();
    if (!updated) return { kind: "not-found" as const, row: null };

    // Transactions and standalone vouchers link agents by name, so a rename
    // must retag every linked row in the same transaction.
    if (newName !== oldName) {
      await recordAccountRename(tx, officeId, "agent", oldName, newName);
      await tx.update(umrahClientsTable).set({ agent: newName }).where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.agent}) = btrim(${oldName})`));
      await tx.update(otherVisasTable).set({ agent: newName }).where(and(eq(otherVisasTable.userId, officeId), sql`btrim(${otherVisasTable.agent}) = btrim(${oldName})`));
      await tx.update(vouchersTable).set({ partyName: newName }).where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyType, "agent"), sql`btrim(${vouchersTable.partyName}) = btrim(${oldName})`));
    }
    return { kind: "ok" as const, row: updated };
  });
  if (row.kind === "conflict") { res.status(409).json({ error: "يوجد وكيل بهذا الاسم مسبقاً" }); return; }
  if (row.kind === "not-found" || !row.row) { res.status(404).json({ error: "Not found" }); return; }

  const agent = row.row;
  const bal = await computeAgentBalance(officeId, agent.id, agent.name, Number(agent.openingBalance) || 0);
  res.json({ id: agent.id, name: agent.name, phone: agent.phone, notes: agent.notes, openingBalance: Number(agent.openingBalance) || 0, ...bal, createdAt: agent.createdAt.toISOString() });
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

  const agentOpening = Number(agent.openingBalance) || 0;
  const bal = await computeAgentBalance(officeId, agent.id, agent.name, agentOpening);

  const umrahTx = await db.select({ id: umrahClientsTable.id, clientName: umrahClientsTable.clientName, issueDate: umrahClientsTable.issueDate, purchasePrice: umrahClientsTable.purchasePrice, createdAt: umrahClientsTable.createdAt }).from(umrahClientsTable).where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.agent}) = btrim(${agent.name})`));
  const visaTx = await db.select({ id: otherVisasTable.id, clientName: otherVisasTable.clientName, issueDate: otherVisasTable.issueDate, purchasePrice: otherVisasTable.purchasePrice, transferredToAgent: otherVisasTable.transferredToAgent, createdAt: otherVisasTable.createdAt }).from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), sql`btrim(${otherVisasTable.agent}) = btrim(${agent.name})`));

  const transactions = [
    ...umrahTx.map((r) => ({ id: `u-${r.id}`, kind: "umrah", clientName: r.clientName, date: r.issueDate, purchase: Number(r.purchasePrice), transferred: 0, createdAt: r.createdAt.toISOString() })),
    ...visaTx.map((r) => ({ id: `v-${r.id}`, kind: "visa", clientName: r.clientName, date: r.issueDate, purchase: Number(r.purchasePrice), transferred: Number(r.transferredToAgent) || 0, createdAt: r.createdAt.toISOString() })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const payments = await db.select().from(agentPaymentsTable).where(and(eq(agentPaymentsTable.userId, officeId), eq(agentPaymentsTable.agentId, agent.id))).orderBy(agentPaymentsTable.paidAt);

  // Standalone agent vouchers (not linked to agent payments) appear as movements.
  const agentVouchers = await db.select().from(vouchersTable)
    .where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyType, "agent"), sql`btrim(${vouchersTable.partyName}) = btrim(${agent.name})`, isNull(vouchersTable.agentPaymentId)))
    .orderBy(vouchersTable.voucherDate);

  // ---- Ledger view (كشف حساب تفصيلي): merged debit/credit movements ----
  // Convention: balance = sales − paidFrom + paidTo → debit = sale or paidTo, credit = paidFrom.
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    const dt = new Date(v as string);
    return isNaN(dt.getTime()) ? null : dt;
  };
  type LedgerRow = { ref: string; kind: string; date: string; sortKey: number; description: string; debit: number; credit: number };
  const movements: LedgerRow[] = [
    // حساب الوكيل على أساس الشراء: قيمة الشراء دائن (له)، والمحول له مدين (عليه).
    ...umrahTx.map((r) => {
      const dt = toDate(r.issueDate) ?? r.createdAt;
      return { ref: `U-${r.id}`, kind: "تأشيرة عمرة", date: dt.toISOString(), sortKey: dt.getTime(), description: `لكم قيمة شراء تأشيرة عمرة باسم (${r.clientName})`, debit: 0, credit: Number(r.purchasePrice) || 0 };
    }),
    ...visaTx.map((r) => {
      const dt = toDate(r.issueDate) ?? r.createdAt;
      return { ref: `V-${r.id}`, kind: "تأشيرة", date: dt.toISOString(), sortKey: dt.getTime(), description: `لكم قيمة شراء تأشيرة باسم (${r.clientName})`, debit: 0, credit: Number(r.purchasePrice) || 0 };
    }),
    ...visaTx.filter((r) => (Number(r.transferredToAgent) || 0) > 0).map((r) => {
      const dt = toDate(r.issueDate) ?? r.createdAt;
      return { ref: `T-${r.id}`, kind: "محول للوكيل", date: dt.toISOString(), sortKey: dt.getTime() + 1, description: `عليكم مبلغ محول لكم عن تأشيرة باسم (${r.clientName})`, debit: Number(r.transferredToAgent) || 0, credit: 0 };
    }),
    ...payments.map((p) => {
      const amount = Number(p.amount) || 0;
      const isFrom = p.direction === "from_agent";
      return {
        ref: `P-${p.id}`,
        kind: isFrom ? "سند قبض" : "سند دفع",
        date: p.paidAt.toISOString(),
        sortKey: p.paidAt.getTime(),
        description: isFrom
          ? `لكم مقابل مبلغ مستلم منكم${p.notes ? ` — ${p.notes}` : ""}`
          : `عليكم مقابل مبلغ مدفوع لكم${p.notes ? ` — ${p.notes}` : ""}`,
        debit: isFrom ? 0 : amount,
        credit: isFrom ? amount : 0,
      };
    }),
    ...agentVouchers.map((v) => {
      const isReceipt = v.kind === "receipt";
      const amount = Number(v.amount) || 0;
      return {
        ref: `S-${v.id}`,
        kind: isReceipt ? "سند قبض" : "سند صرف",
        date: v.voucherDate.toISOString(),
        sortKey: v.voucherDate.getTime(),
        description: isReceipt
          ? `لكم مقابل مبلغ مستلم منكم بموجب سند قبض${v.description ? ` — ${v.description}` : ""}`
          : `عليكم مقابل مبلغ مصروف لكم بموجب سند صرف${v.description ? ` — ${v.description}` : ""}`,
        debit: isReceipt ? 0 : amount,
        credit: isReceipt ? amount : 0,
      };
    }),
  ].sort((a, b) => a.sortKey - b.sortKey);

  // Compare by UTC calendar day (issueDate strings parse to UTC midnight;
  // paidAt is a UTC timestamp) so period boundaries never depend on server timezone.
  const dayOf = (iso: string) => iso.slice(0, 10);
  const parseDay = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime()) ? v : null;
  const fromDay = parseDay(req.query.from);
  const toDay = parseDay(req.query.to);
  const from = fromDay ? new Date(`${fromDay}T00:00:00.000Z`) : null;
  const to = toDay ? new Date(`${toDay}T23:59:59.999Z`) : null;
  const before = fromDay ? movements.filter((m) => dayOf(m.date) < fromDay) : [];
  const inPeriod = movements.filter((m) =>
    (!fromDay || dayOf(m.date) >= fromDay) && (!toDay || dayOf(m.date) <= toDay));
  // القيد الافتتاحي يسبق كل الحركات دائماً.
  const opening = agentOpening + before.reduce((s, m) => s + m.debit - m.credit, 0);

  res.json({
    agent: { id: agent.id, name: agent.name, phone: agent.phone },
    totals: { count: bal.txCount, totalPurchases: bal.totalPurchases, transferred: bal.transferred, paidFrom: bal.paidFrom, paidTo: bal.paidTo, balance: bal.balance },
    payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), direction: p.direction, paidAt: p.paidAt.toISOString(), notes: p.notes })),
    transactions,
    ledger: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      opening,
      entries: inPeriod.map(({ sortKey, ...m }) => m),
    },
  });
});

router.get("/statement/agents/:id/details", async (req, res): Promise<void> => {
  const params = GetAgentDetailsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const officeId = req.session.officeId!;

  const [agent] = await db.select().from(agentsTable).where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
  if (!agent) { res.status(404).json({ error: "Not found" }); return; }

  const bal = await computeAgentBalance(officeId, agent.id, agent.name, Number(agent.openingBalance) || 0);

  const umrahTx = await db.select({ id: umrahClientsTable.id, clientName: umrahClientsTable.clientName, issueDate: umrahClientsTable.issueDate, purchasePrice: umrahClientsTable.purchasePrice, createdAt: umrahClientsTable.createdAt }).from(umrahClientsTable).where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.agent}) = btrim(${agent.name})`));
  const visaTx = await db.select({ id: otherVisasTable.id, clientName: otherVisasTable.clientName, issueDate: otherVisasTable.issueDate, purchasePrice: otherVisasTable.purchasePrice, transferredToAgent: otherVisasTable.transferredToAgent, createdAt: otherVisasTable.createdAt }).from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), sql`btrim(${otherVisasTable.agent}) = btrim(${agent.name})`));

  const transactions = [
    ...umrahTx.map((r) => ({ id: r.id, clientName: r.clientName, type: "عمرة", issueDate: r.issueDate, purchasePrice: Number(r.purchasePrice), transferredToAgent: 0, createdAt: r.createdAt.toISOString() })),
    ...visaTx.map((r) => ({ id: r.id, clientName: r.clientName, type: "تأشيرة", issueDate: r.issueDate, purchasePrice: Number(r.purchasePrice), transferredToAgent: Number(r.transferredToAgent) || 0, createdAt: r.createdAt.toISOString() })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const payments = await db.select().from(agentPaymentsTable).where(and(eq(agentPaymentsTable.userId, officeId), eq(agentPaymentsTable.agentId, agent.id))).orderBy(agentPaymentsTable.paidAt);
  const vouchers = await db.select().from(vouchersTable)
    .where(and(
      eq(vouchersTable.userId, officeId),
      eq(vouchersTable.partyType, "agent"),
      sql`btrim(${vouchersTable.partyName}) = btrim(${agent.name})`,
    ))
    .orderBy(vouchersTable.voucherDate);

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

  const { createVoucher: doCreateVoucher, clientRequestId: rawRequestId, paidAt, ...rest } = parsed.data as any;
  // Empty offline-outbox ids must not share the unique key.
  const clientRequestId =
    typeof rawRequestId === "string" && rawRequestId.trim() !== "" ? rawRequestId : null;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"agent-id:" + officeId + ":" + params.data.id}))`);
    const [agent] = await tx.select().from(agentsTable)
      .where(and(eq(agentsTable.id, params.data.id), eq(agentsTable.userId, officeId)));
    if (!agent) return null;
    await lockAccountNames(tx, officeId, [{ scope: "agent", name: agent.name }]);

    const payment = (await tx.insert(agentPaymentsTable).values({
      ...rest,
      userId: officeId,
      agentId: agent.id,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      clientRequestId,
    }).onConflictDoNothing().returning())[0] ?? null;
    if (!payment) {
      if (!clientRequestId) return null;
      const [existingPayment] = await tx.select().from(agentPaymentsTable)
        .where(eq(agentPaymentsTable.clientRequestId, clientRequestId));
      if (!existingPayment) return null;
      const [voucher] = await tx.select({ id: vouchersTable.id }).from(vouchersTable)
        .where(eq(vouchersTable.agentPaymentId, existingPayment.id));
      return { payment: existingPayment, voucherId: voucher?.id ?? null };
    }
    let voucherId: number | null = null;
    if (doCreateVoucher) {
      const kind = rest.direction === "from_agent" ? "receipt" : "payment";
      const [v] = await tx.insert(vouchersTable).values({
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
    return { payment, voucherId };
  });
  if (!result) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const { payment, voucherId } = result;

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
  const body = ClientCreateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const clientRequestId = normalizeRequestId(body.data.clientRequestId);

  const row = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "client", name: body.data.clientName }]);
    if (await resolveRenamedAccountName(tx, officeId, "client", body.data.clientName) !== body.data.clientName) return null;
    const [existing] = await tx.select({ id: clientAccountsTable.id }).from(clientAccountsTable)
      .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${body.data.clientName})`));
    if (existing) return null;
    return (await tx.insert(clientAccountsTable).values({
      userId: officeId,
      clientName: body.data.clientName,
      phone: body.data.phone ?? null,
      notes: body.data.notes ?? null,
      clientRequestId,
    }).onConflictDoNothing().returning())[0] ?? null;
  });
  if (!row) {
    // Same idempotent-retry rationale as the agent create above: a retried
    // offline create must return the already-created record, not a 409.
    if (clientRequestId) {
      const [existing] = await db.select().from(clientAccountsTable)
        .where(and(eq(clientAccountsTable.userId, officeId), eq(clientAccountsTable.clientRequestId, clientRequestId)));
      if (existing) { res.status(201).json({ id: existing.id, clientName: existing.clientName, phone: existing.phone, notes: existing.notes }); return; }
    }
    res.status(409).json({ error: "يوجد حساب عميل بهذا الاسم مسبقاً" }); return;
  }
  res.status(201).json({ id: row.id, clientName: row.clientName, phone: row.phone, notes: row.notes });
});

// تعديل حساب عميل — يعمل أيضاً للعملاء المشتقين من المعاملات فقط.
router.put("/statement/clients", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const body = ClientEditBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { oldName, newName } = body.data;

  const result = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldName },
      { scope: "client", name: newName },
    ]);
    if (await isRetiredAccountName(tx, officeId, "client", newName)) {
      return { kind: "conflict" as const, account: null };
    }
    const [manual] = await tx.select().from(clientAccountsTable)
      .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${oldName})`));
    const sameName = oldName.trim() === newName.trim();
    if (!sameName) {
      const [manualConflict, visaConflict, umrahConflict, voucherConflict] = await Promise.all([
        tx.select({ id: clientAccountsTable.id }).from(clientAccountsTable)
          .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${newName})`)).limit(1),
        tx.select({ id: otherVisasTable.id }).from(otherVisasTable)
          .where(and(eq(otherVisasTable.userId, officeId), sql`btrim(coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName})) = btrim(${newName})`)).limit(1),
        tx.select({ id: umrahClientsTable.id }).from(umrahClientsTable)
          .where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.client}) = btrim(${newName})`)).limit(1),
        tx.select({ id: vouchersTable.id }).from(vouchersTable)
          .where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyType, "client"), sql`btrim(${vouchersTable.partyName}) = btrim(${newName})`)).limit(1),
      ]);
      if (manualConflict.length || visaConflict.length || umrahConflict.length || voucherConflict.length) {
        return { kind: "conflict" as const, account: null };
      }
    }

    const visaHit = await tx.select({ id: otherVisasTable.id }).from(otherVisasTable)
      .where(and(eq(otherVisasTable.userId, officeId), sql`btrim(coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName})) = btrim(${oldName})`)).limit(1);
    const umrahHit = await tx.select({ id: umrahClientsTable.id }).from(umrahClientsTable)
      .where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.client}) = btrim(${oldName})`)).limit(1);
    const voucherHit = await tx.select({ id: vouchersTable.id }).from(vouchersTable)
      .where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyType, "client"), sql`btrim(${vouchersTable.partyName}) = btrim(${oldName})`)).limit(1);
    if (!manual && !visaHit.length && !umrahHit.length && !voucherHit.length) {
      return { kind: "not-found" as const, account: null };
    }

    const account = manual
      ? (await tx.update(clientAccountsTable).set({
          clientName: newName,
          phone: body.data.phone ?? null,
          notes: body.data.notes ?? null,
          ...(body.data.openingBalance === undefined ? {} : { openingBalance: String(body.data.openingBalance) }),
        }).where(and(eq(clientAccountsTable.id, manual.id), eq(clientAccountsTable.userId, officeId))).returning())[0]
      : (await tx.insert(clientAccountsTable).values({
          userId: officeId,
          clientName: newName,
          phone: body.data.phone ?? null,
          notes: body.data.notes ?? null,
          openingBalance: String(body.data.openingBalance ?? 0),
        }).returning())[0];

    if (newName !== oldName) {
      await recordAccountRename(tx, officeId, "client", oldName, newName);
      await tx.update(otherVisasTable).set({ client: newName })
        .where(and(eq(otherVisasTable.userId, officeId), sql`btrim(coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName})) = btrim(${oldName})`));
      await tx.update(umrahClientsTable).set({ client: newName })
        .where(and(eq(umrahClientsTable.userId, officeId), sql`btrim(${umrahClientsTable.client}) = btrim(${oldName})`));
      await tx.update(vouchersTable).set({ partyName: newName })
        .where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyType, "client"), sql`btrim(${vouchersTable.partyName}) = btrim(${oldName})`));
    }
    return { kind: "ok" as const, account };
  });
  if (result.kind === "conflict") { res.status(409).json({ error: "يوجد حساب عميل بهذا الاسم مسبقاً" }); return; }
  if (result.kind === "not-found" || !result.account) { res.status(404).json({ error: "لا يوجد حساب عميل بهذا الاسم" }); return; }

  const account = result.account;
  res.json({ id: account.id, clientName: account.clientName, phone: account.phone, notes: account.notes, openingBalance: Number(account.openingBalance) || 0 });
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

  // The client account charged is the `client` field (اسم العميل). Legacy rows
  // (created before the field existed) fall back to clientName so old
  // statements keep working without a data migration.
  const visaClientKey = sql<string>`coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName})`;
  const visaRows = await db
    .select({
      clientName: visaClientKey,
      phone: otherVisasTable.phone,
      totalSales: sql<number>`coalesce(sum(${otherVisasTable.salePrice}),0)::float`,
      totalReceived: sql<number>`coalesce(sum(${otherVisasTable.receivedFromClient}),0)::float`,
      balance: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient}),0)::float`,
      txCount: sql<number>`count(*)::int`,
    })
    .from(otherVisasTable)
    .where(eq(otherVisasTable.userId, officeId))
    .groupBy(visaClientKey, otherVisasTable.phone);

  // Umrah transactions charge the client only when اسم العميل was filled in
  // (legacy umrah rows never appeared in client statements — keep it that way).
  const umrahRows = await db
    .select({
      clientName: umrahClientsTable.client,
      phone: umrahClientsTable.phone,
      totalSales: sql<number>`coalesce(sum(${umrahClientsTable.salePrice}),0)::float`,
      txCount: sql<number>`count(*)::int`,
    })
    .from(umrahClientsTable)
    .where(and(eq(umrahClientsTable.userId, officeId), ne(umrahClientsTable.client, "")))
    .groupBy(umrahClientsTable.client, umrahClientsTable.phone);

  // Standalone client vouchers (سندات قبض/صرف باسم العميل).
  // Excludes agent vouchers and vouchers linked to agent payments to avoid
  // double counting — those belong to the agent statement, not the client's.
  // Note: "المقبوض من العميل" lives on the transaction itself; standalone
  // vouchers are separate movements, so adding them here is not duplication.
  const voucherRows = await db
    .select({
      partyName: vouchersTable.partyName,
      receipts: sql<number>`coalesce(sum(case when kind='receipt' then amount::float else 0 end),0)::float`,
      payments: sql<number>`coalesce(sum(case when kind='payment' then amount::float else 0 end),0)::float`,
    })
    .from(vouchersTable)
    .where(and(eq(vouchersTable.userId, officeId), ne(vouchersTable.partyType, "agent"), isNull(vouchersTable.agentPaymentId)))
    .groupBy(vouchersTable.partyName);

  const byName = new Map<string, any>();
  for (const r of visaRows) {
    const key = r.clientName;
    const prev = byName.get(key);
    if (prev) {
      prev.totalSales += r.totalSales; prev.totalReceived += r.totalReceived;
      prev.balance += r.balance; prev.txCount += r.txCount;
      prev.phone = prev.phone || r.phone;
    } else {
      byName.set(key, { clientName: r.clientName, phone: r.phone, notes: null, totalSales: r.totalSales, totalReceived: r.totalReceived, balance: r.balance, txCount: r.txCount, voucherReceipts: 0, voucherPayments: 0, manualId: null, openingBalance: 0 });
    }
  }
  for (const r of umrahRows) {
    const key = r.clientName;
    const prev = byName.get(key);
    if (prev) {
      prev.totalSales += r.totalSales; prev.balance += r.totalSales; prev.txCount += r.txCount;
      prev.phone = prev.phone || r.phone;
    } else {
      byName.set(key, { clientName: key, phone: r.phone, notes: null, totalSales: r.totalSales, totalReceived: 0, balance: r.totalSales, txCount: r.txCount, voucherReceipts: 0, voucherPayments: 0, manualId: null, openingBalance: 0 });
    }
  }
  for (const m of manualRows) {
    const opening = Number(m.openingBalance) || 0;
    const prev = byName.get(m.clientName);
    if (prev) {
      prev.manualId = m.id;
      prev.phone = m.phone || prev.phone;
      prev.notes = m.notes;
      prev.openingBalance = opening;
      prev.balance += opening;
    } else {
      byName.set(m.clientName, { clientName: m.clientName, phone: m.phone, notes: m.notes, totalSales: 0, totalReceived: 0, balance: opening, txCount: 0, voucherReceipts: 0, voucherPayments: 0, manualId: m.id, openingBalance: opening });
    }
  }
  // Fold vouchers into balances only for known client accounts (transaction
  // clients or manual accounts) — vouchers for arbitrary "other" parties
  // should not create client rows.
  for (const v of voucherRows) {
    const prev = byName.get(v.partyName);
    if (!prev) continue;
    prev.voucherReceipts = v.receipts;
    prev.voucherPayments = v.payments;
    // receipt = credit (لكم) → reduces what the client owes; payment = debit.
    prev.balance += v.payments - v.receipts;
  }

  res.json([...byName.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, "ar")));
});

router.get("/statement/clients/details", async (req, res): Promise<void> => {
  const q = GetClientDetailsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "name required" }); return; }
  const officeId = req.session.officeId!;
  const name = q.data.name;

  // Same legacy fallback as the list endpoint: client field, else clientName.
  const clientKeyMatch = sql`coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName}) = ${name}`;
  const [totals] = await db.select({
    totalSales: sql<number>`coalesce(sum(${otherVisasTable.salePrice}),0)::float`,
    totalReceived: sql<number>`coalesce(sum(${otherVisasTable.receivedFromClient}),0)::float`,
    balance: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient}),0)::float`,
    txCount: sql<number>`count(*)::int`,
    phone: sql<string | null>`max(${otherVisasTable.phone})`,
  }).from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), clientKeyMatch));

  const txRows = await db.select().from(otherVisasTable).where(and(eq(otherVisasTable.userId, officeId), clientKeyMatch)).orderBy(otherVisasTable.createdAt);

  // Umrah transactions linked to this client (اسم العميل on the umrah form).
  const umrahRows = await db.select().from(umrahClientsTable)
    .where(and(eq(umrahClientsTable.userId, officeId), eq(umrahClientsTable.client, name)))
    .orderBy(umrahClientsTable.createdAt);

  // Manual client account (holds the opening balance, if any).
  const [account] = await db.select().from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${name})`));
  const openingBalance = Number(account?.openingBalance) || 0;
  // Standalone client vouchers only — agent vouchers and vouchers linked to
  // agent payments belong to the agent statement (avoids double counting).
  const vouchers = await db.select().from(vouchersTable)
    .where(and(eq(vouchersTable.userId, officeId), eq(vouchersTable.partyName, name), ne(vouchersTable.partyType, "agent"), isNull(vouchersTable.agentPaymentId)))
    .orderBy(vouchersTable.voucherDate);
  const voucherReceipts = vouchers.filter((v) => v.kind === "receipt").reduce((s, v) => s + (Number(v.amount) || 0), 0);
  const voucherPayments = vouchers.filter((v) => v.kind === "payment").reduce((s, v) => s + (Number(v.amount) || 0), 0);

  // ---- Ledger view (كشف حساب تفصيلي) — same convention as agents ----
  // balance = Σ(sale − received) → debit = salePrice, credit = receivedFromClient.
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    const dt = new Date(v as string);
    return isNaN(dt.getTime()) ? null : dt;
  };
  type LedgerRow = { ref: string; kind: string; date: string; sortKey: number; description: string; debit: number; credit: number };
  const movements: LedgerRow[] = txRows
    .flatMap((r) => {
      const dt = toDate(r.issueDate) ?? r.createdAt;
      const rows: LedgerRow[] = [{
        ref: `V-${r.id}`,
        kind: r.visaType || "تأشيرة",
        date: dt.toISOString(),
        sortKey: dt.getTime(),
        description: `عليكم مقابل ${r.visaType || "تأشيرة"} باسم (${r.clientName})`,
        debit: Number(r.salePrice) || 0,
        credit: 0,
      }];
      const received = Number(r.receivedFromClient) || 0;
      if (received > 0) {
        rows.push({
          ref: `R-${r.id}`,
          kind: "مقبوضات",
          date: dt.toISOString(),
          sortKey: dt.getTime() + 1,
          description: `لكم مقابل مبلغ مستلم منكم عن ${r.visaType || "تأشيرة"} باسم (${r.clientName})`,
          debit: 0,
          credit: received,
        });
      }
      return rows;
    })
    .concat(umrahRows.map((r): LedgerRow => {
      const dt = toDate(r.issueDate) ?? r.createdAt;
      return {
        ref: `U-${r.id}`,
        kind: "عمرة",
        date: dt.toISOString(),
        sortKey: dt.getTime(),
        description: `عليكم مقابل تأشيرة عمرة باسم (${r.clientName})`,
        debit: Number(r.salePrice) || 0,
        credit: 0,
      };
    }))
    .concat(vouchers.map((v): LedgerRow => {
      const isReceipt = v.kind === "receipt";
      return {
        ref: `S-${v.id}`,
        kind: isReceipt ? "سند قبض" : "سند صرف",
        date: v.voucherDate.toISOString(),
        sortKey: v.voucherDate.getTime(),
        description: isReceipt
          ? `لكم مقابل مبلغ مستلم منكم بموجب سند قبض${v.description ? ` — ${v.description}` : ""}`
          : `عليكم مقابل مبلغ مصروف لكم بموجب سند صرف${v.description ? ` — ${v.description}` : ""}`,
        debit: isReceipt ? 0 : Number(v.amount) || 0,
        credit: isReceipt ? Number(v.amount) || 0 : 0,
      };
    }))
    .sort((a, b) => a.sortKey - b.sortKey);

  // Compare by UTC calendar day so period boundaries never depend on server timezone.
  const dayOf = (iso: string) => iso.slice(0, 10);
  const parseDay = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime()) ? v : null;
  const fromDay = parseDay(req.query.from);
  const toDay = parseDay(req.query.to);
  const from = fromDay ? new Date(`${fromDay}T00:00:00.000Z`) : null;
  const to = toDay ? new Date(`${toDay}T23:59:59.999Z`) : null;
  const before = fromDay ? movements.filter((m) => dayOf(m.date) < fromDay) : [];
  const inPeriod = movements.filter((m) =>
    (!fromDay || dayOf(m.date) >= fromDay) && (!toDay || dayOf(m.date) <= toDay));
  // Opening balance of the account (الرصيد الافتتاحي) always sits before any movement.
  const opening = openingBalance + before.reduce((s, m) => s + m.debit - m.credit, 0);

  const umrahSales = umrahRows.reduce((s, r) => s + (Number(r.salePrice) || 0), 0);
  res.json({
    account: {
      clientName: name, phone: account?.phone ?? totals.phone, notes: account?.notes ?? null,
      manualId: account?.id ?? null, openingBalance,
      totalSales: totals.totalSales + umrahSales, totalReceived: totals.totalReceived,
      voucherReceipts, voucherPayments,
      balance: openingBalance + totals.balance + umrahSales + voucherPayments - voucherReceipts,
      txCount: totals.txCount + umrahRows.length,
    },
    transactions: txRows.map((r) => ({ id: r.id, clientName: r.clientName, type: r.visaType, issueDate: r.issueDate, salePrice: Number(r.salePrice), receivedFromClient: Number(r.receivedFromClient), createdAt: r.createdAt.toISOString() }))
      .concat(umrahRows.map((r) => ({ id: r.id, clientName: r.clientName, type: "عمرة", issueDate: r.issueDate, salePrice: Number(r.salePrice), receivedFromClient: 0, createdAt: r.createdAt.toISOString() }))),
    vouchers: vouchers.map((v) => ({ id: v.id, kind: v.kind, partyType: v.partyType, partyName: v.partyName, amount: Number(v.amount), description: v.description, voucherDate: v.voucherDate.toISOString(), agentPaymentId: v.agentPaymentId, createdAt: v.createdAt.toISOString() })),
    ledger: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      opening,
      entries: inPeriod.map(({ sortKey, ...m }) => m),
    },
  });
});

router.get("/statement/ledger", async (req, res): Promise<void> => {
  const rows = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.userId, req.session.officeId!)).orderBy(ledgerEntriesTable.entryDate);
  res.json(rows.map((r) => ({ id: r.id, type: r.type, amount: Number(r.amount), description: r.description, entryDate: r.entryDate.toISOString(), createdAt: r.createdAt.toISOString() })));
});

router.post("/statement/ledger", async (req, res): Promise<void> => {
  const parsed = LedgerEditBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  let entryDate: Date;
  try { entryDate = parseDate(parsed.data.entryDate, "تاريخ القيد"); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const { clientRequestId: rawRequestId, ...rest } = parsed.data;
  // Empty offline-outbox ids must not share the unique key.
  const clientRequestId =
    typeof rawRequestId === "string" && rawRequestId.trim() !== "" ? rawRequestId : null;
  const row = (await db.insert(ledgerEntriesTable).values({
    userId: officeId,
    type: rest.type,
    amount: String(rest.amount),
    description: rest.description,
    entryDate,
    clientRequestId,
  }).onConflictDoNothing().returning())[0] ?? null;
  if (!row) {
    if (clientRequestId) {
      const [existing] = await db.select().from(ledgerEntriesTable)
        .where(eq(ledgerEntriesTable.clientRequestId, clientRequestId));
      if (existing) {
        res.status(201).json({ id: existing.id, type: existing.type, amount: Number(existing.amount), description: existing.description, entryDate: existing.entryDate.toISOString(), createdAt: existing.createdAt.toISOString() });
        return;
      }
    }
    res.status(409).json({ error: "Conflict" });
    return;
  }
  res.status(201).json({ id: row.id, type: row.type, amount: Number(row.amount), description: row.description, entryDate: row.entryDate.toISOString(), createdAt: row.createdAt.toISOString() });
});

router.put("/statement/ledger/:id", async (req, res): Promise<void> => {
  const params = DeleteLedgerEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = LedgerEditBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  let entryDate: Date;
  try { entryDate = parseDate(parsed.data.entryDate, "تاريخ القيد"); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const [row] = await db.update(ledgerEntriesTable).set({
    type: parsed.data.type,
    amount: String(parsed.data.amount),
    description: parsed.data.description,
    entryDate,
  }).where(and(eq(ledgerEntriesTable.id, params.data.id), eq(ledgerEntriesTable.userId, req.session.officeId!))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, type: row.type, amount: Number(row.amount), description: row.description, entryDate: row.entryDate.toISOString(), createdAt: row.createdAt.toISOString() });
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

// ---- القيد الافتتاحي: يربط رصيداً افتتاحياً بعميل أو وكيل ----
const OpeningBody = z.object({
  partyType: z.enum(["client", "agent"]),
  name: z.string().trim().min(1),
  amount: z.number(),
});

router.get("/statement/opening", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const clientRows = await db.select().from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), sql`${clientAccountsTable.openingBalance} <> 0`));
  const agentRows = await db.select().from(agentsTable)
    .where(and(eq(agentsTable.userId, officeId), sql`${agentsTable.openingBalance} <> 0`));
  res.json([
    ...clientRows.map((r) => ({ partyType: "client" as const, name: r.clientName, amount: Number(r.openingBalance) })),
    ...agentRows.map((r) => ({ partyType: "agent" as const, name: r.name, amount: Number(r.openingBalance) })),
  ]);
});

router.post("/statement/opening", async (req, res): Promise<void> => {
  const parsed = OpeningBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const officeId = req.session.officeId!;
  const { partyType, name, amount } = parsed.data;

  if (partyType === "agent") {
    const [row] = await db.transaction(async (tx) => {
      await lockAccountNames(tx, officeId, [{ scope: "agent", name }]);
      const canonicalName = await resolveRenamedAccountName(tx, officeId, "agent", name);
      await lockAccountNames(tx, officeId, [{ scope: "agent", name: canonicalName }]);
      return tx.update(agentsTable)
        .set({ openingBalance: String(amount) })
        .where(and(eq(agentsTable.userId, officeId), sql`btrim(${agentsTable.name}) = btrim(${canonicalName})`))
        .returning();
    });
    if (!row) { res.status(404).json({ error: "الوكيل غير موجود" }); return; }
    res.json({ partyType, name: row.name, amount: Number(row.openingBalance) });
    return;
  }

  // Client: upsert into manual client accounts so it exists even before any visa.
  const [row] = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "client", name }]);
    const canonicalName = await resolveRenamedAccountName(tx, officeId, "client", name);
    await lockAccountNames(tx, officeId, [{ scope: "client", name: canonicalName }]);
    const [existing] = await tx.select().from(clientAccountsTable)
      .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${canonicalName})`));
    return existing
      ? tx.update(clientAccountsTable).set({ openingBalance: String(amount) })
          .where(eq(clientAccountsTable.id, existing.id)).returning()
      : tx.insert(clientAccountsTable).values({ userId: officeId, clientName: canonicalName, openingBalance: String(amount) }).returning();
  });
  res.json({ partyType, name: row.clientName, amount: Number(row.openingBalance) });
});

export default router;
