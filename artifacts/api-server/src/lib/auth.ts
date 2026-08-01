import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: number;
    officeId: number;
    role: string;
  }
}

/** officeId of a user: sub → parentUserId, owner/provider → own id */
export function officeIdOf(user: { id: number; role: string; parentUserId: number | null }): number {
  return user.parentUserId ?? user.id;
}

/** Normalise legacy "admin" role to "provider" */
export function normaliseRole(role: string): string {
  return role === "admin" ? "provider" : role;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireOffice(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Check expiry — fetch owner row
  const officeId = req.session.officeId;
  if (!officeId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.session.role !== "provider") {
    const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, officeId));
    if (!owner) {
      res.status(401).json({ error: "Account not found" });
      return;
    }
    if (owner.expiresAt && owner.expiresAt < new Date()) {
      res.status(403).json({ error: "Account expired" });
      return;
    }
    // Owner subscription not yet activated (pending first owner login):
    // block sub sessions from operating before the countdown starts.
    if (req.session.userId !== officeId && owner.pendingMonths != null && owner.expiresAt == null) {
      res.status(403).json({ error: "لم يُفعَّل اشتراك المكتب بعد — يجب أن يسجل الحساب الرئيسي دخوله أولاً" });
      return;
    }
    // Sub account locked by the owner — block even active sessions.
    if (req.session.userId !== officeId) {
      const [self] = await db.select({ disabled: usersTable.disabled }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
      if (!self) {
        res.status(401).json({ error: "Account not found" });
        return;
      }
      if (self.disabled) {
        res.status(403).json({ error: "تم إيقاف هذا الحساب من قبل مدير المكتب" });
        return;
      }
    }
  }
  next();
}

export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireOffice(req, res, async () => {
    const role = req.session.role;
    if (role !== "owner" && role !== "provider") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export async function requireProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.session.role !== "provider") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
