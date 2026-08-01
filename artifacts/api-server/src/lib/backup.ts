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

const d = (v: unknown): Date | null => (v ? new Date(v as string) : null);

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

export async function restoreFromBackupPayload(payload: any, requesterId: number) {
  if (!payload || payload.version !== 2 || typeof payload.data !== "object" || payload.data === null) {
    throw Object.assign(new Error("Invalid backup payload"), { status: 400 });
  }
  const data = payload.data;
  const arrays = ["users", "settings", "umrah", "visas", "agents", "agentPayments", "ledger", "vouchers", "clientAccounts"];
  for (const k of arrays) {
    if (!Array.isArray(data[k])) throw Object.assign(new Error(`Invalid backup payload: missing ${k}`), { status: 400 });
  }

  await db.transaction(async (tx) => {
    // --- 1. Users ---
    const current = await tx.select().from(usersTable);
    const currentById = new Map(current.map((u) => [u.id, u]));
    const backupIds = new Set<number>(data.users.map((u: any) => u.id));

    // Delete users not in the backup (never providers, never the requester).
    for (const u of current) {
      if (!backupIds.has(u.id) && u.role !== "provider" && u.id !== requesterId) {
        await tx.delete(usersTable).where(eq(usersTable.id, u.id));
      }
    }

    for (const u of data.users) {
      const existing = currentById.get(u.id);
      if (existing) {
        await tx.update(usersTable).set({
          username: u.username,
          role: u.role,
          parentUserId: u.parentUserId ?? null,
          expiresAt: d(u.expiresAt),
          providerLabel: u.providerLabel ?? null,
          disabled: !!u.disabled,
        }).where(eq(usersTable.id, u.id));
      } else {
        // Unusable random hash — never matches any password; provider resets it.
        const randomHash = "$restore$" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        await tx.insert(usersTable).values({
          id: u.id,
          username: u.username,
          passwordHash: randomHash,
          role: u.role,
          parentUserId: u.parentUserId ?? null,
          expiresAt: d(u.expiresAt),
          providerLabel: u.providerLabel ?? null,
          disabled: !!u.disabled,
          createdAt: d(u.createdAt) ?? new Date(),
        });
      }
    }

    // --- 2. Wipe data tables (children before parents) ---
    await tx.delete(vouchersTable);
    await tx.delete(agentPaymentsTable);
    await tx.delete(agentsTable);
    await tx.delete(ledgerEntriesTable);
    await tx.delete(umrahClientsTable);
    await tx.delete(otherVisasTable);
    await tx.delete(clientAccountsTable);
    await tx.delete(officeSettingsTable);

    // --- 3. Reinsert from the backup, skipping rows whose owner no longer exists ---
    const userIds = new Set<number>((await tx.select({ id: usersTable.id }).from(usersTable)).map((r) => r.id));
    const own = (rows: any[]) => rows.filter((r) => userIds.has(r.userId ?? r.user_id));

    for (const s of data.settings.filter((r: any) => userIds.has(r.userId))) {
      await tx.insert(officeSettingsTable).values({ ...s, updatedAt: d(s.updatedAt) ?? new Date() });
    }
    for (const r of own(data.umrah)) {
      await tx.insert(umrahClientsTable).values({ ...r, entryDate: d(r.entryDate), createdAt: d(r.createdAt) ?? new Date() });
    }
    for (const r of own(data.visas)) {
      await tx.insert(otherVisasTable).values({ ...r, createdAt: d(r.createdAt) ?? new Date() });
    }
    for (const r of own(data.agents)) {
      await tx.insert(agentsTable).values({ ...r, createdAt: d(r.createdAt) ?? new Date() });
    }
    const agentIds = new Set(own(data.agents).map((a: any) => a.id));
    const paymentRows = own(data.agentPayments).filter((r: any) => agentIds.has(r.agentId));
    for (const r of paymentRows) {
      await tx.insert(agentPaymentsTable).values({ ...r, paidAt: d(r.paidAt) ?? new Date(), createdAt: d(r.createdAt) ?? new Date() });
    }
    const paymentIds = new Set(paymentRows.map((r: any) => r.id));
    for (const r of own(data.ledger)) {
      await tx.insert(ledgerEntriesTable).values({ ...r, entryDate: d(r.entryDate) ?? new Date(), createdAt: d(r.createdAt) ?? new Date() });
    }
    for (const r of own(data.vouchers)) {
      await tx.insert(vouchersTable).values({
        ...r,
        agentPaymentId: r.agentPaymentId != null && paymentIds.has(r.agentPaymentId) ? r.agentPaymentId : null,
        voucherDate: d(r.voucherDate) ?? new Date(),
        createdAt: d(r.createdAt) ?? new Date(),
      });
    }
    for (const r of own(data.clientAccounts)) {
      await tx.insert(clientAccountsTable).values({ ...r, createdAt: d(r.createdAt) ?? new Date() });
    }

    // --- 4. Resync serial sequences after explicit-id inserts ---
    for (const t of ["users", "umrah_clients", "other_visas", "agents", "agent_payments", "ledger_entries", "vouchers", "client_accounts"]) {
      await tx.execute(sql.raw(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`
      ));
    }
  });
}
