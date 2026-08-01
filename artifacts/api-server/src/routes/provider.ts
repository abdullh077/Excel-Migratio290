import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, officeSettingsTable } from "@workspace/db";
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
router.use(requireProvider);

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
      officeName: settingsMap.get(u.parentUserId ?? u.id) ?? null,
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

export default router;
