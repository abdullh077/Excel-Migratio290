import { db, clientAccountsTable, agentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Auto-register the agent (الوكيل) when a transaction references a name that
 * is not yet in the office's agents list — no manual adding from the
 * statement page needed.
 */
export async function ensureAgent(officeId: number, agent: string | undefined): Promise<void> {
  const name = (agent ?? "").trim();
  if (!name) return;
  const [existing] = await db.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(eq(agentsTable.userId, officeId), eq(agentsTable.name, name)));
  if (!existing) {
    await db.insert(agentsTable).values({ userId: officeId, name });
  }
}

/**
 * Ensure a client account exists for the given name and (optionally) set its
 * opening balance. Used when saving umrah/visa transactions that reference a
 * client (اسم العميل) — keeps the statement page linked automatically.
 */
export async function ensureClientAccount(
  officeId: number,
  client: string | undefined,
  openingBalance: number | undefined,
): Promise<void> {
  const name = (client ?? "").trim();
  if (!name) return;
  const [existing] = await db.select().from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), eq(clientAccountsTable.clientName, name)));
  if (!existing) {
    await db.insert(clientAccountsTable).values({
      userId: officeId,
      clientName: name,
      openingBalance: String(openingBalance ?? 0),
    });
  } else if (openingBalance !== undefined && !isNaN(openingBalance)) {
    await db.update(clientAccountsTable)
      .set({ openingBalance: String(openingBalance) })
      .where(eq(clientAccountsTable.id, existing.id));
  }
}
