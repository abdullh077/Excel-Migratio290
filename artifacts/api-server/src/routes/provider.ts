import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import {
  db, usersTable, officeSettingsTable,
  umrahClientsTable, otherVisasTable, agentsTable, agentPaymentsTable,
  ledgerEntriesTable, vouchersTable,
} from "@workspace/db";
import { eq, sql, or } from "drizzle-orm";
import { requireProvider } from "../lib/auth.js";
import {
  CreateAccountBody,
  DeleteAccountParams,
  UpdateAccountExpiryParams,
  UpdateAccountExpiryBody,
  UpdateAccountPasswordParams,
  UpdateAccountPasswordBody,
  UpdateAccountUsernameParams,
  UpdateAccountUsernameBody,
} from "@workspace/api-zod";

const router = Router();
router.use("/provider", requireProvider);

router.get("/provider/accounts", async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const settings = await db.select({ userId: officeSettingsTable.userId, officeName: officeSettingsTable.officeName }).from(officeSettingsTable);
  const settingsMap = new Map(settings.map((s) => [s.userId, s.officeName]));

  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      parentUserId: u.parentUserId,
      expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null,
      // Provider reference label takes priority; fall back to the office's own configured name.
      officeName: u.providerLabel ?? settingsMap.get(u.parentUserId ?? u.id) ?? null,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.post("/provider/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { username, password, role, parentUserId, expiresAt } = parsed.data as any;
  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role: role ?? "owner",
    parentUserId: parentUserId ?? null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();

  res.status(201).json({
    id: user.id, username: user.username, role: user.role,
    parentUserId: user.parentUserId, expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    officeName: null, createdAt: user.createdAt.toISOString(),
  });
});

router.delete("/provider/accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Deleted" });
});

router.patch("/provider/accounts/:id/expiry", async (req, res): Promise<void> => {
  const params = UpdateAccountExpiryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAccountExpiryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const expiresAt = (parsed.data as any).expiresAt ? new Date((parsed.data as any).expiresAt) : null;
  const [user] = await db.update(usersTable).set({ expiresAt }).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: user.id, username: user.username, role: user.role, parentUserId: user.parentUserId, expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null, officeName: null, createdAt: user.createdAt.toISOString() });
});

router.patch("/provider/accounts/:id/password", async (req, res): Promise<void> => {
  const params = UpdateAccountPasswordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAccountPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [user] = await db.update(usersTable).set({ passwordHash, failedAttempts: 0, lockedUntil: null }).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Password updated" });
});

router.patch("/provider/accounts/:id/username", async (req, res): Promise<void> => {
  const params = UpdateAccountUsernameParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAccountUsernameBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.update(usersTable).set({ username: parsed.data.username }).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Username updated" });
});

// --- Create-account aliases matching the frontend payloads ---

const CreateOwnerBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  expiresAt: z.string().nullish(),
  months: z.number().int().min(1).max(60).nullish(),
  officeName: z.string().trim().nullish(),
});

router.post("/provider/owners", async (req, res): Promise<void> => {
  const parsed = CreateOwnerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { username, password, expiresAt, months, officeName } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  // months takes priority: calendar-safe expiry computed server-side.
  const expiry = months ? addMonthsClamped(new Date(), months) : expiresAt ? new Date(expiresAt) : null;
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role: "owner",
    parentUserId: null,
    expiresAt: expiry,
    providerLabel: officeName ?? null,
  }).returning();

  if (officeName) {
    // Seed the new office's branding with the same name; never overwrite an existing row.
    await db.insert(officeSettingsTable)
      .values({ userId: user.id, officeName, updatedAt: new Date() })
      .onConflictDoNothing();
  }

  res.status(201).json({
    id: user.id, username: user.username, role: user.role,
    parentUserId: user.parentUserId, expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    officeName: officeName ?? null, createdAt: user.createdAt.toISOString(),
  });
});

// Provider reference label: which office does this account belong to.
// Stored on the users row — deliberately does NOT touch office_settings,
// so the office's own configured branding name is never overwritten.
router.patch("/provider/accounts/:id/office-name", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({ officeName: z.string().trim().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [user] = await db.update(usersTable)
    .set({ providerLabel: body.data.officeName })
    .where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ message: "Updated", officeName: body.data.officeName });
});

// Calendar-safe month addition: clamps to the last day of the target month
// (e.g. Jan 31 + 1 month = Feb 28/29, not Mar 2/3).
function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

// Subscription renewal: extend expiry by N months from max(now, current expiry).
router.post("/provider/accounts/:id/renew", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({ months: z.number().int().min(1).max(60) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  // Renewal always applies to the owner account (subs inherit it).
  const ownerId = user.parentUserId ?? user.id;
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, ownerId));
  if (!owner) { res.status(404).json({ error: "Owner not found" }); return; }

  const now = new Date();
  const base = addMonthsClamped(owner.expiresAt && owner.expiresAt > now ? new Date(owner.expiresAt) : now, body.data.months);

  await db.update(usersTable).set({ expiresAt: base }).where(eq(usersTable.id, ownerId));
  // Keep sub accounts' reference copy in sync.
  await db.update(usersTable).set({ expiresAt: base }).where(eq(usersTable.parentUserId, ownerId));

  res.json({ id: ownerId, expiresAt: base.toISOString() });
});

const CreateSubBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  parentId: z.number().optional(),
  parentUsername: z.string().optional(),
  expiresAt: z.string().nullish(),
}).refine((v) => v.parentId != null || (v.parentUsername != null && v.parentUsername.length > 0), {
  message: "parentId or parentUsername required",
});

router.post("/provider/subs", async (req, res): Promise<void> => {
  const parsed = CreateSubBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { username, password, parentId, parentUsername, expiresAt } = parsed.data;

  let parent;
  if (parentId != null) {
    [parent] = await db.select().from(usersTable).where(eq(usersTable.id, parentId));
  } else {
    [parent] = await db.select().from(usersTable).where(eq(usersTable.username, parentUsername!));
  }
  if (!parent) { res.status(404).json({ error: "Parent office not found" }); return; }
  if (parent.role !== "owner") { res.status(400).json({ error: "Parent must be an owner account" }); return; }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role: "sub",
    parentUserId: parent.id,
    // subs inherit the owner's window; store the provided/owner expiry for reference
    expiresAt: expiresAt ? new Date(expiresAt) : (parent.expiresAt ?? null),
  }).returning();

  const [settings] = await db.select({ officeName: officeSettingsTable.officeName }).from(officeSettingsTable).where(eq(officeSettingsTable.userId, parent.id));

  res.status(201).json({
    id: user.id, username: user.username, role: user.role,
    parentUserId: user.parentUserId, expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    officeName: settings?.officeName ?? null, createdAt: user.createdAt.toISOString(),
  });
});

// --- Backups ---

const BACKUPS_DIR = path.resolve(process.cwd(), "backups");

async function ensureBackupsDir(): Promise<void> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
}

// Reject path traversal / stray separators in backup names.
function safeBackupName(name: string): string | null {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!name.endsWith(".json")) return null;
  return name;
}

router.get("/provider/backups", async (_req, res): Promise<void> => {
  await ensureBackupsDir();
  const entries = await fs.readdir(BACKUPS_DIR);
  const files = entries.filter((n) => n.endsWith(".json"));
  const result = await Promise.all(files.map(async (name) => {
    const stat = await fs.stat(path.join(BACKUPS_DIR, name));
    return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
  }));
  result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(result);
});

router.post("/provider/backup", async (_req, res): Promise<void> => {
  await ensureBackupsDir();

  const [users, settings, umrah, visas, agents, agentPayments, ledger, vouchers] = await Promise.all([
    db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, parentUserId: usersTable.parentUserId, expiresAt: usersTable.expiresAt, createdAt: usersTable.createdAt }).from(usersTable),
    db.select().from(officeSettingsTable),
    db.select().from(umrahClientsTable),
    db.select().from(otherVisasTable),
    db.select().from(agentsTable),
    db.select().from(agentPaymentsTable),
    db.select().from(ledgerEntriesTable),
    db.select().from(vouchersTable),
  ]);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const name = `backup-${stamp}.json`;
  const payload = {
    createdAt: now.toISOString(),
    version: 1,
    data: { users, settings, umrah, visas, agents, agentPayments, ledger, vouchers },
  };
  const json = JSON.stringify(payload, null, 2);
  await fs.writeFile(path.join(BACKUPS_DIR, name), json, "utf8");

  res.status(201).json({ name, size: Buffer.byteLength(json), createdAt: now.toISOString() });
});

router.get("/provider/backups/:name", async (req, res): Promise<void> => {
  const name = safeBackupName(req.params.name);
  if (!name) { res.status(400).json({ error: "Invalid name" }); return; }
  await ensureBackupsDir();
  const filePath = path.join(BACKUPS_DIR, name);
  try {
    const content = await fs.readFile(filePath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(content);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

export default router;
