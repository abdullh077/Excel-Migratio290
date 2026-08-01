import { Router } from "express";
import { db, umrahClientsTable, otherVisasTable } from "@workspace/db";
import { eq, sql, ilike, and, or } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";

const router = Router();
router.use("/archive", requireOffice);

router.get("/archive", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const { search, visaType, month, year } = req.query as Record<string, string>;
  const term = search ? `%${search}%` : "";

  const umrahRows = await db.select().from(umrahClientsTable).where(
    and(
      eq(umrahClientsTable.userId, officeId),
      search
        ? or(
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
        : undefined,
      month && year ? sql`EXTRACT(MONTH FROM ${umrahClientsTable.createdAt}) = ${Number(month)} AND EXTRACT(YEAR FROM ${umrahClientsTable.createdAt}) = ${Number(year)}` : undefined,
      visaType && visaType !== "umrah" ? sql`false` : undefined,
    )
  ).orderBy(sql`${umrahClientsTable.createdAt} DESC`);

  const visaRows = await db.select().from(otherVisasTable).where(
    and(
      eq(otherVisasTable.userId, officeId),
      search
        ? or(
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
        : undefined,
      visaType && visaType !== "umrah" ? eq(otherVisasTable.visaType, visaType) : undefined,
      month && year ? sql`EXTRACT(MONTH FROM ${otherVisasTable.createdAt}) = ${Number(month)} AND EXTRACT(YEAR FROM ${otherVisasTable.createdAt}) = ${Number(year)}` : undefined,
    )
  ).orderBy(sql`${otherVisasTable.createdAt} DESC`);

  const umrahMapped = umrahRows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    passportNumber: r.passportNumber,
    phone: r.phone,
    issueDate: r.issueDate,
    visaType: "عمرة",
    agent: r.agent,
    issuingAuthority: r.issuingAuthority,
    purchasePrice: Number(r.purchasePrice),
    salePrice: Number(r.salePrice),
    profit: Number(r.salePrice) - Number(r.purchasePrice),
    receivedFromClient: null,
    clientBalance: null,
    transferredToAgent: null,
    agentBalance: null,
    sourceTable: "umrah",
    createdAt: r.createdAt.toISOString(),
  }));

  const visaMapped = visaRows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    passportNumber: r.passportNumber,
    phone: r.phone,
    issueDate: r.issueDate,
    visaType: r.visaType,
    agent: r.agent,
    issuingAuthority: r.issuingAuthority,
    purchasePrice: Number(r.purchasePrice),
    salePrice: Number(r.salePrice),
    profit: Number(r.salePrice) - Number(r.purchasePrice),
    receivedFromClient: Number(r.receivedFromClient),
    clientBalance: Number(r.salePrice) - Number(r.receivedFromClient),
    transferredToAgent: Number(r.transferredToAgent),
    agentBalance: Number(r.purchasePrice) - Number(r.transferredToAgent),
    sourceTable: "visa",
    createdAt: r.createdAt.toISOString(),
  }));

  const combined = [...umrahMapped, ...visaMapped].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json(combined);
});

export default router;
