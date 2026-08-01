import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
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
  // الرصيد الافتتاحي — a starting balance (debit if positive) folded into the
  // client statement before any transactions.
  openingBalance: numeric("opening_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientAccount = typeof clientAccountsTable.$inferSelect;
