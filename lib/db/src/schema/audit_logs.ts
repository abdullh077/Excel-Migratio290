import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// Append-only audit trail for sensitive actions: login attempts, data
// mutations (create/update/delete), and sensitive downloads (backups).
// Never updated after insert. Not multi-tenant-filtered at the schema level —
// providers need to see everything; office-level filtering happens in the
// (future) reporting UI via officeId.
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  // Who performed the action. NULL when the actor could not be identified
  // (e.g. a login attempt against a username that doesn't exist).
  actorUserId: integer("actor_user_id"),
  // The office the action was performed within/against, when known.
  officeId: integer("office_id"),
  // Username as typed at login time — kept even on failure, when there may
  // be no matching user row to join back to.
  username: text("username"),
  // Short machine-readable action name, e.g. "login_success",
  // "login_failed_bad_password", "POST /api/visas", "download_office_backup".
  action: text("action").notNull(),
  method: text("method"),
  path: text("path"),
  resourceId: integer("resource_id"),
  statusCode: integer("status_code"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
