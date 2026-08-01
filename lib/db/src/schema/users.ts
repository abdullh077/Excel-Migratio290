import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // provider = vendor (me), owner = office main account, sub = employee account
  role: text("role").notNull().default("sub"),
  // For sub accounts: the owner (office) account id. NULL for owner & provider.
  parentUserId: integer("parent_user_id"),
  // Account validity: NULL = unlimited (provider/owner). A past date blocks login.
  // Only meaningful on OWNER accounts; subs inherit their owner's window.
  expiresAt: timestamp("expires_at"),
  // Provider-only reference label ("this account belongs to office X").
  // Separate from office_settings.officeName, which the office itself manages.
  providerLabel: text("provider_label"),
  // Brute-force protection: consecutive failed logins + temporary lockout.
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
