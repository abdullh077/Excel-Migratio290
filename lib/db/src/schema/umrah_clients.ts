import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const umrahClientsTable = pgTable("umrah_clients", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }), // owning office account
  clientName: text("client_name").notNull(),
  passportNumber: text("passport_number").notNull(),
  phone: text("phone").notNull(),
  agent: text("agent").notNull(),
  // اسم العميل — the client account charged with the sale in the statement.
  // clientName above is اسم الجواز (the passport holder / end customer).
  client: text("client").notNull().default(""),
  issueDate: text("issue_date").notNull(),
  stayDuration: integer("stay_duration").notNull(), // days; <90 = inside KSA, >=90 = outside
  issuingAuthority: text("issuing_authority").notNull().default(""),
  transactionParty: text("transaction_party"), // جهة المعاملة — shown on receipt
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
  sendStatus: text("send_status").notNull().default("pending"), // pending | sent | delivered
  notes: text("notes"),
  entryDate: timestamp("entry_date"), // when pilgrim entered KSA; starts the stay countdown (feature C)
  // Idempotency key for offline-outbox uploads: retrying an upload whose
  // response was lost must NOT create a duplicate record.
  clientRequestId: text("client_request_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUmrahClientSchema = createInsertSchema(umrahClientsTable).omit({ id: true, userId: true, createdAt: true });
export type InsertUmrahClient = z.infer<typeof insertUmrahClientSchema>;
export type UmrahClient = typeof umrahClientsTable.$inferSelect;
