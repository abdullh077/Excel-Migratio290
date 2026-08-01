import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-office (multi-tenant) branding: one row per user account.
// Each account manages its own office data — no shared/global record.
// Drives the print/receipt page and the WhatsApp reminder messages.
export const officeSettingsTable = pgTable("office_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  officeName: text("office_name"),
  officePhone: text("office_phone"),
  officePhone2: text("office_phone2"),
  officeAddress: text("office_address"),
  officeLogo: text("office_logo"), // base64 data URL — office/login logo (white-label)
  stampImage: text("stamp_image"), // base64 data URL — official stamp shown on vouchers/receipts
  signatureImage: text("signature_image"), // base64 data URL — signature shown on vouchers/receipts
  whatsappUmrahTemplate: text("whatsapp_umrah_template"),
  whatsappOtherTemplate: text("whatsapp_other_template"),
  configured: boolean("configured").notNull().default(false), // first-run prompt flag
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OfficeSettings = typeof officeSettingsTable.$inferSelect;
