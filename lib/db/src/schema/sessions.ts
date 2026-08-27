import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// Matches the table connect-pg-simple actually creates/uses at runtime
// (table name "session", singular — see artifacts/api-server/src/lib/session.ts).
// Declared here so `drizzle-kit push` recognizes it as a known table instead
// of proposing to drop it as an orphan.
export const sessionsTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
