import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

// Server data backups stored in the central database.
export const backupsTable = pgTable("backups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // "auto" (daily) or "manual"
  kind: text("kind").notNull().default("manual"),
  size: integer("size").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Backup = typeof backupsTable.$inferSelect;
