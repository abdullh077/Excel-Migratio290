import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, usersTable, officeSettingsTable, backupsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireProvider } from "../lib/auth.js";
import { assertBackupPayload, createBackup, restoreFromBackupPayload } from "../lib/backup.js";
import { addMonthsClamped } from "../lib/dates.js";
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

const isManagedAccount = (role: string) => role === "owner" || role === "sub";

async function getManagedAccount(id: number) {
  if (!Number.isInteger(id)) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user && isManagedAccount(user.role) ? user : null;
}

async function usernameIsAvailable(username: string, exceptId?: number): Promise<boolean> {
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.username, username));
  return !existing || existing.id === exceptId;
}

function parseOptionalDate(value: string | null | undefined): Date | null | "invalid" {
  if (value == null || value === "") return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) {
      return "invalid";
    }
    return date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

// Provider changes their own login credentials. This route never accepts a
// user id, so a provider cannot use it to modify another account.
router.patch("/provider/credentials", async (req, res): Promise<void> => {
  const parsed = z.object({
    currentPassword: z.string().min(1),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف").optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!me || me.role !== "provider" && me.role !== "admin") {
    res.status(404).json({ error: "الحساب غير موجود" });
    return;
  }

  const currentPasswordMatches = await bcrypt.compare(parsed.data.currentPassword, me.passwordHash);
  if (!currentPasswordMatches) {
    res.status(403).json({ error: "كلمة المرور الحالية غير صحيحة" });
    return;
  }

  const username = parsed.data.username;
  if ((!username || username === me.username) && !parsed.data.password) {
    res.status(400).json({ error: "لم يتم إدخال أي تغيير" });
    return;
  }
  if (username && username !== me.username) {
    const [duplicate] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username));
    if (duplicate && duplicate.id !== me.id) {
      res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" });
      return;
    }
  }

  const updates: Record<string, unknown> = {
    credentialsChangedAt: new Date(),
    failedAttempts: 0,
    lockedUntil: null,
  };
  if (username) updates.username = username;
  if (parsed.data.password) updates.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, me.id))
    .returning({ username: usersTable.username, credentialsChangedAt: usersTable.credentialsChangedAt });

  res.json({
    username: updated.username,
    credentialsChangedAt: updated.credentialsChangedAt?.toISOString() ?? null,
  });
});

router.get("/provider/accounts", async (req, res): Promise<void> => {
  const users = (await db.select().from(usersTable).orderBy(usersTable.createdAt))
    .filter((user) => isManagedAccount(user.role));
  const settings = await db.select({ userId: officeSettingsTable.userId, officeName: officeSettingsTable.officeName }).from(officeSettingsTable);
  const settingsMap = new Map(settings.map((s) => [s.userId, s.officeName]));

  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      parentUserId: u.parentUserId,
      expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null,
      pendingMonths: u.pendingMonths ?? null,
      // Provider reference label takes priority; fall back to the office's own configured name.
      officeName: u.providerLabel ?? settingsMap.get(u.parentUserId ?? u.id) ?? null,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.post("/provider/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { password, role, parentUserId, expiresAt } = parsed.data as any;
  const username = String(parsed.data.username).trim();
  if (!username) { res.status(400).json({ error: "اسم المستخدم مطلوب" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" }); return; }
  if (!(await usernameIsAvailable(username))) { res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" }); return; }
  const expiry = parseOptionalDate(expiresAt);
  if (expiry === "invalid") { res.status(400).json({ error: "تاريخ الانتهاء غير صحيح" }); return; }
  if (role === "owner" && parentUserId != null) {
    res.status(400).json({ error: "الحساب الرئيسي لا يتبع حساباً آخر" }); return;
  }
  if (role === "sub") {
    const parent = await getManagedAccount(parentUserId);
    if (!parent || parent.role !== "owner") { res.status(400).json({ error: "الحساب الرئيسي غير صالح" }); return; }
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role,
    parentUserId: role === "sub" ? parentUserId : null,
    expiresAt: expiry,
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
  const user = await getManagedAccount(params.data.id);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role === "owner") {
    const children = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.parentUserId, user.id))
      .limit(1);
    if (children.length) {
      res.status(409).json({ error: "احذف الحسابات الفرعية التابعة لهذا المكتب أولاً" });
      return;
    }
  }
  await db.delete(usersTable).where(eq(usersTable.id, user.id));
  res.json({ message: "Deleted" });
});

router.patch("/provider/accounts/:id/expiry", async (req, res): Promise<void> => {
  const params = UpdateAccountExpiryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAccountExpiryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const target = await getManagedAccount(params.data.id);
  if (!target || target.role !== "owner") { res.status(404).json({ error: "Not found" }); return; }
  const expiresAt = parseOptionalDate((parsed.data as any).expiresAt);
  if (expiresAt === "invalid") { res.status(400).json({ error: "تاريخ الانتهاء غير صحيح" }); return; }
  // Explicitly setting an expiry (or unlimited) supersedes any not-yet-started pending months.
  const [user] = await db.update(usersTable).set({ expiresAt, pendingMonths: null }).where(eq(usersTable.id, target.id)).returning();
  await db.update(usersTable).set({ expiresAt }).where(eq(usersTable.parentUserId, target.id));
  res.json({ id: user.id, username: user.username, role: user.role, parentUserId: user.parentUserId, expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null, officeName: null, createdAt: user.createdAt.toISOString() });
});

router.patch("/provider/accounts/:id/password", async (req, res): Promise<void> => {
  const params = UpdateAccountPasswordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAccountPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.password.length < 6) { res.status(400).json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" }); return; }
  const target = await getManagedAccount(params.data.id);
  if (!target) { res.status(404).json({ error: "Not found" }); return; }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.update(usersTable).set({ passwordHash, failedAttempts: 0, lockedUntil: null, credentialsChangedAt: new Date() }).where(eq(usersTable.id, target.id));
  res.json({ message: "Password updated" });
});

router.patch("/provider/accounts/:id/username", async (req, res): Promise<void> => {
  const params = UpdateAccountUsernameParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAccountUsernameBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const target = await getManagedAccount(params.data.id);
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  const username = parsed.data.username.trim();
  if (!username) { res.status(400).json({ error: "اسم المستخدم مطلوب" }); return; }
  if (!(await usernameIsAvailable(username, target.id))) { res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" }); return; }

  await db.update(usersTable).set({ username, credentialsChangedAt: new Date() }).where(eq(usersTable.id, target.id));
  res.json({ message: "Username updated" });
});

// --- Create-account aliases matching the frontend payloads ---

const CreateOwnerBody = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
  expiresAt: z.string().nullish(),
  months: z.number().int().min(1).max(60).nullish(),
  officeName: z.string().trim().nullish(),
});

router.post("/provider/owners", async (req, res): Promise<void> => {
  const parsed = CreateOwnerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { username, password, expiresAt, months, officeName } = parsed.data;
  if (!(await usernameIsAvailable(username))) { res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" }); return; }
  const expiry = parseOptionalDate(expiresAt);
  if (expiry === "invalid") { res.status(400).json({ error: "تاريخ الانتهاء غير صحيح" }); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  // Month-based subscriptions do NOT start at creation: the countdown begins
  // at the owner's first login (pendingMonths → expiresAt in auth/login).
  // A custom explicit date stays fixed as given.
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role: "owner",
    parentUserId: null,
    expiresAt: months ? null : expiry,
    pendingMonths: months ?? null,
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
  const target = await getManagedAccount(id);
  if (!target || target.role !== "owner") { res.status(404).json({ error: "Not found" }); return; }

  const [user] = await db.update(usersTable)
    .set({ providerLabel: body.data.officeName })
    .where(eq(usersTable.id, target.id)).returning();
  res.json({ message: "Updated", officeName: body.data.officeName });
});

// Subscription renewal: extend expiry by N months from max(now, current expiry).
router.post("/provider/accounts/:id/renew", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({ months: z.number().int().min(1).max(60) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const owner = await getManagedAccount(id);
  if (!owner || owner.role !== "owner") { res.status(404).json({ error: "Not found" }); return; }
  const ownerId = owner.id;

  // Owner never logged in yet (countdown not started): add months to the pending balance.
  if (owner.pendingMonths != null && owner.expiresAt == null) {
    const pending = owner.pendingMonths + body.data.months;
    await db.update(usersTable).set({ pendingMonths: pending }).where(eq(usersTable.id, ownerId));
    res.json({ id: ownerId, expiresAt: null, pendingMonths: pending });
    return;
  }

  const now = new Date();
  const base = addMonthsClamped(owner.expiresAt && owner.expiresAt > now ? new Date(owner.expiresAt) : now, body.data.months);

  await db.update(usersTable).set({ expiresAt: base }).where(eq(usersTable.id, ownerId));
  // Keep sub accounts' reference copy in sync.
  await db.update(usersTable).set({ expiresAt: base }).where(eq(usersTable.parentUserId, ownerId));

  res.json({ id: ownerId, expiresAt: base.toISOString() });
});

const CreateSubBody = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
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
  if (!(await usernameIsAvailable(username))) { res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" }); return; }
  const expiry = parseOptionalDate(expiresAt);
  if (expiry === "invalid") { res.status(400).json({ error: "تاريخ الانتهاء غير صحيح" }); return; }

  let parent;
  if (parentId != null) {
    [parent] = await db.select().from(usersTable).where(eq(usersTable.id, parentId));
  } else {
    [parent] = await db.select().from(usersTable).where(eq(usersTable.username, parentUsername!));
  }
  if (!parent) { res.status(404).json({ error: "Parent office not found" }); return; }
  if (parent.role !== "owner") { res.status(400).json({ error: "Parent must be an owner account" }); return; }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role: "sub",
    parentUserId: parent.id,
    // subs inherit the owner's window; store the provided/owner expiry for reference
    expiresAt: expiry ?? (parent.expiresAt ?? null),
  }).returning();

  const [settings] = await db.select({ officeName: officeSettingsTable.officeName }).from(officeSettingsTable).where(eq(officeSettingsTable.userId, parent.id));

  res.status(201).json({
    id: user.id, username: user.username, role: user.role,
    parentUserId: user.parentUserId, expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    officeName: settings?.officeName ?? null, createdAt: user.createdAt.toISOString(),
  });
});

// --- Backups (stored in the central database) ---

router.get("/provider/backups", async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: backupsTable.id, name: backupsTable.name, kind: backupsTable.kind,
    size: backupsTable.size, createdAt: backupsTable.createdAt,
  }).from(backupsTable).orderBy(desc(backupsTable.createdAt));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/provider/backup", async (_req, res): Promise<void> => {
  const row = await createBackup("manual");
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.get("/provider/backups/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(backupsTable).where(eq(backupsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${row.name}"`);
  res.send(JSON.stringify(row.data, null, 2));
});

// Restore a stored backup. Takes a safety backup first, then replaces all data
// atomically. Provider-only (router guard) + strong client-side confirmation.
router.post("/provider/backups/:id/restore", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(backupsTable).where(eq(backupsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  try {
    assertBackupPayload(row.data);
  } catch (err: any) {
    res.status(err?.status ?? 400).json({ error: err?.message ?? "النسخة الاحتياطية غير صالحة" });
    return;
  }
  const safety = await createBackup("manual"); // safety snapshot of the current state
  try {
    await restoreFromBackupPayload(row.data, (req.session as any).userId);
  } catch (err: any) {
    res.status(err?.status ?? 500).json({ error: err?.message ?? "Restore failed" });
    return;
  }
  res.json({ message: "Restored", from: row.name, safetyBackupId: safety.id });
});

// Restore from an uploaded backup .json file (sent as parsed JSON body).
router.post("/provider/restore-upload", async (req, res): Promise<void> => {
  const payload = req.body?.payload ?? req.body;
  try {
    assertBackupPayload(payload);
  } catch (err: any) {
    res.status(err?.status ?? 400).json({ error: err?.message ?? "النسخة الاحتياطية غير صالحة" });
    return;
  }
  const safety = await createBackup("manual");
  try {
    await restoreFromBackupPayload(payload, (req.session as any).userId);
  } catch (err: any) {
    res.status(err?.status ?? 500).json({ error: err?.message ?? "Restore failed" });
    return;
  }
  res.json({ message: "Restored", safetyBackupId: safety.id });
});

export default router;
