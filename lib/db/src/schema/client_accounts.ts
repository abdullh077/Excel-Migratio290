import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Manually-added client accounts (statement page). Visa-derived client rows are
// aggregated on the fly; these rows let the office add a client before any visa exists.
export const clientAccountsTable = pgTable("client_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  clientName: text("client_name").notNull(),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientAccount = typeof clientAccountsTable.$inferSelect;
