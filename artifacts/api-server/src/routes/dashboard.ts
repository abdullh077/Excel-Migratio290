import { Router } from "express";
import { db, umrahClientsTable, otherVisasTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";

const router = Router();
router.use("/dashboard", requireOffice);

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;

  const [umrahStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      insideKsa: sql<number>`count(*) filter (where ${umrahClientsTable.entryDate} is not null and extract(epoch from now() - ${umrahClientsTable.entryDate})/86400 < ${umrahClientsTable.stayDuration})::int`,
      outsideKsa: sql<number>`count(*) filter (where ${umrahClientsTable.entryDate} is null or extract(epoch from now() - ${umrahClientsTable.entryDate})/86400 >= ${umrahClientsTable.stayDuration})::int`,
      totalPurchase: sql<number>`coalesce(sum(${umrahClientsTable.purchasePrice}),0)::float`,
      totalSale: sql<number>`coalesce(sum(${umrahClientsTable.salePrice}),0)::float`,
      totalProfit: sql<number>`coalesce(sum(${umrahClientsTable.salePrice} - ${umrahClientsTable.purchasePrice}),0)::float`,
    })
    .from(umrahClientsTable)
    .where(eq(umrahClientsTable.userId, officeId));

  const [visaStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalProfit: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.purchasePrice}),0)::float`,
      totalClientBalance: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient}),0)::float`,
      totalAgentBalance: sql<number>`coalesce(sum(${otherVisasTable.purchasePrice} - ${otherVisasTable.transferredToAgent}),0)::float`,
    })
    .from(otherVisasTable)
    .where(eq(otherVisasTable.userId, officeId));

  res.json({
    umrahTotal: umrahStats.total,
    umrahInsideKsa: umrahStats.insideKsa,
    umrahOutsideKsa: umrahStats.outsideKsa,
    umrahTotalPurchase: umrahStats.totalPurchase,
    umrahTotalSale: umrahStats.totalSale,
    umrahTotalProfit: umrahStats.totalProfit,
    visasTotal: visaStats.total,
    visasTotalProfit: visaStats.totalProfit,
    visasTotalClientBalance: visaStats.totalClientBalance,
    visasTotalAgentBalance: visaStats.totalAgentBalance,
    totalProfit: umrahStats.totalProfit + visaStats.totalProfit,
  });
});

router.get("/dashboard/monthly", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const year = Number(req.query.year) || new Date().getFullYear();

  const umrahRows = await db
    .select({
      month: sql<number>`extract(month from ${umrahClientsTable.createdAt})::int`,
      count: sql<number>`count(*)::int`,
      purchase: sql<number>`coalesce(sum(${umrahClientsTable.purchasePrice}),0)::float`,
      sale: sql<number>`coalesce(sum(${umrahClientsTable.salePrice}),0)::float`,
      profit: sql<number>`coalesce(sum(${umrahClientsTable.salePrice} - ${umrahClientsTable.purchasePrice}),0)::float`,
    })
    .from(umrahClientsTable)
    .where(sql`${umrahClientsTable.userId} = ${officeId} and extract(year from ${umrahClientsTable.createdAt}) = ${year}`)
    .groupBy(sql`extract(month from ${umrahClientsTable.createdAt})`);

  const visaRows = await db
    .select({
      month: sql<number>`extract(month from ${otherVisasTable.createdAt})::int`,
      count: sql<number>`count(*)::int`,
      profit: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.purchasePrice}),0)::float`,
    })
    .from(otherVisasTable)
    .where(sql`${otherVisasTable.userId} = ${officeId} and extract(year from ${otherVisasTable.createdAt}) = ${year}`)
    .groupBy(sql`extract(month from ${otherVisasTable.createdAt})`);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const result = months.map((m) => {
    const u = umrahRows.find((r) => r.month === m);
    const v = visaRows.find((r) => r.month === m);
    return {
      month: m,
      year,
      umrahCount: u?.count ?? 0,
      umrahPurchase: u?.purchase ?? 0,
      umrahSale: u?.sale ?? 0,
      umrahProfit: u?.profit ?? 0,
      visasCount: v?.count ?? 0,
      visasProfit: v?.profit ?? 0,
    };
  });
  res.json(result);
});

router.get("/dashboard/agents", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;

  const umrahRows = await db
    .select({ agent: umrahClientsTable.agent, count: sql<number>`count(*)::int`, profit: sql<number>`coalesce(sum(${umrahClientsTable.salePrice} - ${umrahClientsTable.purchasePrice}),0)::float` })
    .from(umrahClientsTable)
    .where(eq(umrahClientsTable.userId, officeId))
    .groupBy(umrahClientsTable.agent);

  const visaRows = await db
    .select({ agent: otherVisasTable.agent, count: sql<number>`count(*)::int`, profit: sql<number>`coalesce(sum(${otherVisasTable.salePrice} - ${otherVisasTable.purchasePrice}),0)::float` })
    .from(otherVisasTable)
    .where(eq(otherVisasTable.userId, officeId))
    .groupBy(otherVisasTable.agent);

  const agentMap = new Map<string, { umrahCount: number; visasCount: number; totalProfit: number }>();
  for (const r of umrahRows) {
    agentMap.set(r.agent, { umrahCount: r.count, visasCount: 0, totalProfit: r.profit });
  }
  for (const r of visaRows) {
    const existing = agentMap.get(r.agent) ?? { umrahCount: 0, visasCount: 0, totalProfit: 0 };
    agentMap.set(r.agent, { ...existing, visasCount: r.count, totalProfit: existing.totalProfit + r.profit });
  }

  res.json(Array.from(agentMap.entries()).map(([agent, stats]) => ({ agent, ...stats })));
});

router.get("/dashboard/outstanding", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;

  const rows = await db
    .select({
      id: otherVisasTable.id,
      clientName: sql<string>`coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName})`,
      phone: otherVisasTable.phone,
      clientBalance: sql<number>`(${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient})::float`,
      agentBalance: sql<number>`(${otherVisasTable.purchasePrice} - ${otherVisasTable.transferredToAgent})::float`,
    })
    .from(otherVisasTable)
    .where(sql`${otherVisasTable.userId} = ${officeId} and (${otherVisasTable.salePrice} - ${otherVisasTable.receivedFromClient} > 0 or ${otherVisasTable.purchasePrice} - ${otherVisasTable.transferredToAgent} > 0)`);

  res.json(rows.map((r) => ({ ...r, type: "visa" })));
});

export default router;
