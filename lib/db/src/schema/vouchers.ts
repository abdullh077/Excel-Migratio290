import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { agentPaymentsTable } from "./agents";

// سندات القبض والصرف — office-scoped receipt/payment vouchers.
// kind: "receipt" = سند قبض, "payment" = سند صرف.
// Can be standalone OR linked to an agent payment (agentPaymentId).
// partyType: "agent" | "client" | "other" — party referenced by text name.
export const vouchersTable = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }), // owning office
  kind: text("kind").notNull(), // receipt | payment
  partyType: text("party_type").notNull().default("other"), // agent | client | other
  partyName: text("party_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  voucherDate: timestamp("voucher_date").defaultNow().notNull(),
  agentPaymentId: integer("agent_payment_id").references(() => agentPaymentsTable.id, {
    onDelete: "set null",
  }),
  // Idempotency key for offline-outbox uploads.
  clientRequestId: text("client_request_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Voucher = typeof vouchersTable.$inferSelect;
