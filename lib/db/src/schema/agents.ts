import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Registered agents (وكلاء) — office-scoped. Transactions reference agents by
// exact name (the forms offer this list); renaming an agent updates its
// transactions' agent text to keep statements consistent.
export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }), // owning office
  name: text("name").notNull(),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Agent = typeof agentsTable.$inferSelect;

// Payments exchanged with an agent (settling his dues).
// direction: "from_agent" = قبضنا من الوكيل, "to_agent" = دفعنا للوكيل.
export const agentPaymentsTable = pgTable("agent_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  direction: text("direction").notNull(), // from_agent | to_agent
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type AgentPayment = typeof agentPaymentsTable.$inferSelect;

// General office ledger — income & expenses outside visa/umrah transactions.
export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // income | expense
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
