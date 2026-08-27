import type { Request, Response, NextFunction } from "express";
import { logAudit, normalisePath, resourceIdFrom } from "./audit.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// GET requests that hand back sensitive data as a file — worth auditing like
// a mutation even though they don't change anything.
const DOWNLOAD_GET_PATTERNS = [/^\/api\/office\/backup$/, /^\/api\/provider\/backups\/\d+$/];

/**
 * Generic audit trail for data-changing requests and sensitive downloads.
 * Login/logout are handled separately in routes/auth.ts (they need
 * finer-grained outcomes — unknown user vs bad password vs locked — than a
 * single method+path label gives us). Skips /api/auth/* entirely to avoid
 * double-logging.
 */
export function auditMutations(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  if (path.startsWith("/auth/") || path === "/auth") {
    next();
    return;
  }

  const isMutation = MUTATING_METHODS.has(req.method);
  const isDownload = req.method === "GET" && DOWNLOAD_GET_PATTERNS.some((re) => re.test(`/api${path}`));
  if (!isMutation && !isDownload) {
    next();
    return;
  }

  res.on("finish", () => {
    // Only log requests that actually got past auth/validation into the
    // handler logic — 401/403/404 before a real mutation isn't useful noise.
    if (res.statusCode >= 400 && res.statusCode !== 409) return;
    logAudit({
      action: isDownload ? `download ${normalisePath(`/api${path}`)}` : `${req.method} ${normalisePath(`/api${path}`)}`,
      actorUserId: req.session?.userId ?? null,
      officeId: req.session?.officeId ?? null,
      method: req.method,
      path: `/api${path}`,
      resourceId: resourceIdFrom(req),
      statusCode: res.statusCode,
      ip: req.ip ?? null,
    });
  });
  next();
}
