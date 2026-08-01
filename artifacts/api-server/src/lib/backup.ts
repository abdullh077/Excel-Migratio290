import {
  db, usersTable, officeSettingsTable,
  umrahClientsTable, otherVisasTable, agentsTable, agentPaymentsTable,
  ledgerEntriesTable, vouchersTable, backupsTable, clientAccountsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";

// Full server snapshot (all offices). Stored as JSONB in the central database.
export async function buildBackupPayload() {
  const [users, settings, umrah, visas, agents, agentPayments, ledger, vouchers, clientAccounts] = await Promise.all([
    db.select({
      id: usersTable.id, username: usersTable.username, role: usersTable.role,
      parentUserId: usersTable.parentUserId, expiresAt: usersTable.expiresAt,
      providerLabel: usersTable.providerLabel, disabled: usersTable.disabled,
      createdAt: usersTable.createdAt,
    }).from(usersTable),
    db.select().from(officeSettingsTable),
    db.select().from(umrahClientsTable),
    db.select().from(otherVisasTable),
    db.select().from(agentsTable),
    db.select().from(agentPaymentsTable),
    db.select().from(ledgerEntriesTable),
    db.select().from(vouchersTable),
    db.select().from(clientAccountsTable),
  ]);
  return {
    createdAt: new Date().toISOString(),
    version: 2,
    data: { users, settings, umrah, visas, agents, agentPayments, ledger, vouchers, clientAccounts },
  };
}

const KEEP_BACKUPS = 30;

export async function createBackup(kind: "auto" | "manual") {
  const payload = await buildBackupPayload();
  const json = JSON.stringify(payload);
  const now = new Date();
  const name = `backup-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  const [row] = await db.insert(backupsTable).values({
    name, kind, size: Buffer.byteLength(json), data: payload, createdAt: now,
  }).returning({ id: backupsTable.id, name: backupsTable.name, kind: backupsTable.kind, size: backupsTable.size, createdAt: backupsTable.createdAt });

  // Prune: keep the most recent KEEP_BACKUPS rows.
  const old = await db.select({ id: backupsTable.id }).from(backupsTable).orderBy(desc(backupsTable.createdAt)).offset(KEEP_BACKUPS);
  for (const o of old) await db.delete(backupsTable).where(eq(backupsTable.id, o.id));

  return row;
}

// Lazy "daily" backup: no cron on autoscale — called on login. Creates at most
// one automatic backup per calendar day.
export async function maybeDailyBackup(): Promise<void> {
  try {
    // Advisory lock makes the check-then-create atomic across concurrent logins.
    const lock = await db.execute(sql`SELECT pg_try_advisory_lock(748291) AS locked`);
    const locked = (lock as any).rows?.[0]?.locked ?? (lock as any)[0]?.locked;
    if (!locked) return; // another request is already handling today's backup
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rows = await db.select({ createdAt: backupsTable.createdAt })
        .from(backupsTable)
        .where(eq(backupsTable.kind, "auto"))
        .orderBy(desc(backupsTable.createdAt))
        .limit(1);
      if (!rows.length || rows[0].createdAt < startOfDay) {
        await createBackup("auto");
      }
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(748291)`);
    }
  } catch (err) {
    logger.error({ err }, "daily backup failed");
  }
}
