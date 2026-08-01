import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const otherVisasTable = pgTable("other_visas", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }), // owning office account
  clientName: text("client_name").notNull(),
  passportNumber: text("passport_number").notNull(),
  requestNumber: text("request_number").notNull(),
  phone: text("phone").notNull(),
  agent: text("agent").notNull(),
  // اسم العميل — the client account charged with the sale in the statement.
  // clientName above is اسم الجواز (the passport holder / end customer).
  client: text("client").notNull().default(""),
  issueDate: text("issue_date").notNull(),
  visaType: text("visa_type").notNull(),
  issuingAuthority: text("issuing_authority").notNull().default(""),
  transactionParty: text("transaction_party"), // جهة المعاملة — shown on receipt
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
  receivedFromClient: numeric("received_from_client", { precision: 12, scale: 2 }).notNull().default("0"),
  transferredToAgent: numeric("transferred_to_agent", { precision: 12, scale: 2 }).notNull().default("0"),
  sendStatus: text("send_status").notNull().default("pending"), // pending | تم الإرسال | تم التسليم (feature D)
  notes: text("notes"),
  // Idempotency key for offline-outbox uploads (see umrah_clients).
  clientRequestId: text("client_request_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOtherVisaSchema = createInsertSchema(otherVisasTable).omit({ id: true, userId: true, createdAt: true });
export type InsertOtherVisa = z.infer<typeof insertOtherVisaSchema>;
export type OtherVisa = typeof otherVisasTable.$inferSelect;
