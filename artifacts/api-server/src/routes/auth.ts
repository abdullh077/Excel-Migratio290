import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { officeIdOf, normaliseRole } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { maybeDailyBackup } from "../lib/backup.js";
import { addMonthsClamped } from "../lib/dates.js";
import { loginLimiter } from "../lib/rateLimit.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    logAudit({ action: "login_failed_unknown_user", username, method: "POST", path: "/api/auth/login", statusCode: 401, ip: req.ip ?? null });
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  // Lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    logAudit({ action: "login_blocked_locked", username, actorUserId: user.id, method: "POST", path: "/api/auth/login", statusCode: 401, ip: req.ip ?? null });
    res.status(401).json({ error: `الحساب مقفل مؤقتاً. حاول بعد ${mins} دقيقة` });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = (user.failedAttempts ?? 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db.update(usersTable).set({ failedAttempts: attempts, lockedUntil }).where(eq(usersTable.id, user.id));
    logAudit({ action: "login_failed_bad_password", username, actorUserId: user.id, method: "POST", path: "/api/auth/login", statusCode: 401, ip: req.ip ?? null });
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  // Owner-controlled lock on sub accounts
  if (user.disabled) {
    logAudit({ action: "login_blocked_disabled", username, actorUserId: user.id, method: "POST", path: "/api/auth/login", statusCode: 403, ip: req.ip ?? null });
    res.status(403).json({ error: "تم إيقاف هذا الحساب من قبل مدير المكتب" });
    return;
  }

  // Reset failed attempts
  await db.update(usersTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(usersTable.id, user.id));

  const role = normaliseRole(user.role);
  const officeId = officeIdOf({ ...user, role });

  // First login of an owner with a purchased-but-not-started subscription:
  // start the countdown NOW (pendingMonths → expiresAt) and sync sub accounts.
  if (role === "owner" && user.pendingMonths != null && user.expiresAt == null) {
    const expiry = addMonthsClamped(new Date(), user.pendingMonths);
    await db.update(usersTable).set({ expiresAt: expiry, pendingMonths: null }).where(eq(usersTable.id, user.id));
    await db.update(usersTable).set({ expiresAt: expiry }).where(eq(usersTable.parentUserId, user.id));
    user.expiresAt = expiry;
    user.pendingMonths = null;
  }

  // Check expiry for non-provider
  if (role !== "provider") {
    const [owner] = officeId !== user.id
      ? await db.select().from(usersTable).where(eq(usersTable.id, officeId))
      : [user];
    if (owner?.expiresAt && owner.expiresAt < new Date()) {
      res.status(403).json({ error: "انتهت صلاحية الاشتراك" });
      return;
    }
    // Sub trying to log in while the owner's subscription hasn't started yet
    // (owner never logged in): block — the owner must activate first.
    if (role !== "owner" && owner && owner.pendingMonths != null && owner.expiresAt == null) {
      res.status(403).json({ error: "لم يُفعَّل اشتراك المكتب بعد — يجب أن يسجل الحساب الرئيسي دخوله أولاً" });
      return;
    }
  }

  req.session.regenerate((err) => {
    if (err) {
      logger.error({ err }, "Session regenerate error");
      res.status(500).json({ error: "Server error" });
      return;
    }
    req.session.userId = user.id;
    req.session.officeId = officeId;
    req.session.role = role;
    req.session.save(() => {
      logAudit({ action: "login_success", username: user.username, actorUserId: user.id, officeId, method: "POST", path: "/api/auth/login", statusCode: 200, ip: req.ip ?? null });
      res.json({ id: user.id, username: user.username, role, officeId, expiresAt: user.expiresAt ?? null });
      // Lazy daily backup — fire and forget, never blocks the login response.
      void maybeDailyBackup();
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  const { userId, officeId } = req.session;
  req.session.destroy(() => {
    logAudit({ action: "logout", actorUserId: userId ?? null, officeId: officeId ?? null, method: "POST", path: "/api/auth/logout", statusCode: 200, ip: req.ip ?? null });
    res.json({ message: "Logged out" });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.disabled) {
    // Owner locked this account — kill the stale session too.
    req.session.destroy(() => {
      res.status(403).json({ error: "تم إيقاف هذا الحساب من قبل مدير المكتب" });
    });
    return;
  }
  const role = normaliseRole(user.role);
  const officeId = officeIdOf({ ...user, role });
  res.json({ id: user.id, username: user.username, role, officeId, expiresAt: user.expiresAt ?? null });
});

export default router;
