import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db, usersTable, officeSettingsTable,
  umrahClientsTable, otherVisasTable, agentsTable, agentPaymentsTable,
  ledgerEntriesTable, vouchersTable, clientAccountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireOwner } from "../lib/auth.js";

// Owner-facing management of the office's own sub accounts + office backup.
const router = Router();
router.use("/office", requireOwner);

function toSub(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    disabled: u.disabled,
    credentialsChangedAt: u.credentialsChangedAt ? u.credentialsChangedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

// Fetch a sub account and verify it belongs to the session's office.
async function ownSub(req: any, id: number) {
  if (!Number.isInteger(id)) return null;
  const [sub] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!sub || sub.role !== "sub" || sub.parentUserId !== req.session.officeId) return null;
  return sub;
}

router.get("/office/subs", async (req, res): Promise<void> => {
  const subs = await db.select().from(usersTable).where(eq(usersTable.parentUserId, req.session.officeId!));
  res.json(subs.filter((s) => s.role === "sub").map(toSub));
});

router.patch("/office/subs/:id/lock", async (req, res): Promise<void> => {
  const body = z.object({ disabled: z.boolean() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const sub = await ownSub(req, Number(req.params.id));
  if (!sub) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(usersTable).set({ disabled: body.data.disabled }).where(eq(usersTable.id, sub.id)).returning();
  res.json(toSub(updated));
});

router.patch("/office/subs/:id/username", async (req, res): Promise<void> => {
  const body = z.object({ username: z.string().trim().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const sub = await ownSub(req, Number(req.params.id));
  if (!sub) { res.status(404).json({ error: "Not found" }); return; }
  const [exists] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, body.data.username));
  if (exists && exists.id !== sub.id) { res.status(400).json({ error: "اسم المستخدم مستخدم مسبقاً" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ username: body.data.username, credentialsChangedAt: new Date() })
    .where(eq(usersTable.id, sub.id)).returning();
  res.json(toSub(updated));
});

router.patch("/office/subs/:id/password", async (req, res): Promise<void> => {
  const body = z.object({ password: z.string().min(4) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "كلمة المرور قصيرة جداً (4 أحرف على الأقل)" }); return; }
  const sub = await ownSub(req, Number(req.params.id));
  if (!sub) { res.status(404).json({ error: "Not found" }); return; }
  const passwordHash = await bcrypt.hash(body.data.password, 10);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, failedAttempts: 0, lockedUntil: null, credentialsChangedAt: new Date() })
    .where(eq(usersTable.id, sub.id)).returning();
  res.json(toSub(updated));
});

// Office-scoped backup download: only this office's data.
// Used by the client to automatically save a daily copy on each device.
router.get("/office/backup", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const [settings, umrah, visas, agents, agentPayments, ledger, vouchers, clientAccounts] = await Promise.all([
    db.select().from(officeSettingsTable).where(eq(officeSettingsTable.userId, officeId)),
    db.select().from(umrahClientsTable).where(eq(umrahClientsTable.userId, officeId)),
    db.select().from(otherVisasTable).where(eq(otherVisasTable.userId, officeId)),
    db.select().from(agentsTable).where(eq(agentsTable.userId, officeId)),
    db.select().from(agentPaymentsTable).where(eq(agentPaymentsTable.userId, officeId)),
    db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.userId, officeId)),
    db.select().from(vouchersTable).where(eq(vouchersTable.userId, officeId)),
    db.select().from(clientAccountsTable).where(eq(clientAccountsTable.userId, officeId)),
  ]);
  const now = new Date();
  const payload = {
    createdAt: now.toISOString(),
    version: 2,
    officeId,
    data: { settings, umrah, visas, agents, agentPayments, ledger, vouchers, clientAccounts },
  };
  const name = `office-backup-${now.toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(JSON.stringify(payload, null, 2));
});

export default router;
