import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

export interface AuditEntry {
  action: string;
  actorUserId?: number | null;
  officeId?: number | null;
  username?: string | null;
  method?: string | null;
  path?: string | null;
  resourceId?: number | null;
  statusCode?: number | null;
  ip?: string | null;
}

// Fire-and-forget audit write. Never throws into the caller and never
// blocks/delays the HTTP response — an audit-log outage must not take the
// app down. Failures are logged (not silently swallowed) so they're
// discoverable in the workflow logs.
export function logAudit(entry: AuditEntry): void {
  void db
    .insert(auditLogsTable)
    .values({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      officeId: entry.officeId ?? null,
      username: entry.username ?? null,
      method: entry.method ?? null,
      path: entry.path ?? null,
      resourceId: entry.resourceId ?? null,
      statusCode: entry.statusCode ?? null,
      ip: entry.ip ?? null,
    })
    .catch((err) => {
      logger.error({ err, action: entry.action }, "audit log write failed");
    });
}

/** Collapse numeric path segments so similar routes group under one action, e.g. /api/visas/42 -> /api/visas/:id */
export function normalisePath(path: string): string {
  return path
    .split("?")[0]
    .split("/")
    .map((seg) => (/^\d+$/.test(seg) ? ":id" : seg))
    .join("/");
}

/** Best-effort numeric :id from the route params, for linking the log row back to a record. */
export function resourceIdFrom(req: Request): number | null {
  const raw = req.params?.id;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}
