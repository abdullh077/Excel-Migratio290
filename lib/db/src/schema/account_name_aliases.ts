import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Keeps a durable canonical target for account names after a rename. The
// transaction tables use names rather than foreign keys, so this prevents a
// delayed offline/form save from recreating a retired name.
export const accountNameAliasesTable = pgTable("account_name_aliases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), // agent | client
  oldName: text("old_name").notNull(),
  currentName: text("current_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("account_name_aliases_user_scope_old_name").on(table.userId, table.scope, table.oldName),
]);