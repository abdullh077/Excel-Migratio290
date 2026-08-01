import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { officeIdOf, normaliseRole } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  // Lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    res.status(401).json({ error: `الحساب مقفل مؤقتاً. حاول بعد ${mins} دقيقة` });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = (user.failedAttempts ?? 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db.update(usersTable).set({ failedAttempts: attempts, lockedUntil }).where(eq(usersTable.id, user.id));
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  // Reset failed attempts
  await db.update(usersTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(usersTable.id, user.id));

  const role = normaliseRole(user.role);
  const officeId = officeIdOf({ ...user, role });

  // Check expiry for non-provider
  if (role !== "provider") {
    const [owner] = officeId !== user.id
      ? await db.select().from(usersTable).where(eq(usersTable.id, officeId))
      : [user];
    if (owner?.expiresAt && owner.expiresAt < new Date()) {
      res.status(403).json({ error: "انتهت صلاحية الاشتراك" });
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
      res.json({ id: user.id, username: user.username, role, officeId, expiresAt: user.expiresAt ?? null });
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
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
  const role = normaliseRole(user.role);
  const officeId = officeIdOf({ ...user, role });
  res.json({ id: user.id, username: user.username, role, officeId, expiresAt: user.expiresAt ?? null });
});

export default router;
