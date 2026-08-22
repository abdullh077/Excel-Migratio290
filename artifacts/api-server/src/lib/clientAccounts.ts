import { accountNameAliasesTable, clientAccountsTable, agentsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

// Keep name-based links and account creation on the same advisory-lock
// protocol as statement renames. PostgreSQL advisory transaction locks are
// released automatically when the surrounding transaction commits or rolls
// back.
export function normalizeAccountName(name: string): string {
  return name.trim();
}

// Visa statements use `client` when supplied and fall back to `clientName`
// for legacy or blank-client rows. Locks must use the identical key or a
// rename can miss a concurrently inserted visa.
export function effectiveVisaClientName(client: string | undefined, clientName: string | undefined): string {
  return normalizeAccountName(client ?? "") || normalizeAccountName(clientName ?? "");
}

export async function lockAccountNames(
  tx: any,
  officeId: number,
  names: Array<{ scope: "agent" | "client"; name: string | undefined }>,
): Promise<void> {
  // Alias resolution can add a second (canonical) name after the original
  // retired name has been locked. Serialize each office/scope before taking
  // fine-grained keys so a concurrent rename cannot create an inverse
  // retired→canonical wait cycle.
  const scopes = [...new Set(names.map(({ scope }) => scope))].sort();
  for (const scope of scopes) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"account-scope:" + officeId + ":" + scope}))`);
  }
  const keys = [...new Set(
    names
      .filter(({ name }) => typeof name === "string" && normalizeAccountName(name) !== "")
      .map(({ scope, name }) => `${scope}:${officeId}:${normalizeAccountName(name!)}`),
  )].sort();
  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

export async function resolveRenamedAccountName(
  tx: any,
  officeId: number,
  scope: "agent" | "client",
  name: string | undefined,
): Promise<string> {
  let current = normalizeAccountName(name ?? "");
  for (let depth = 0; current && depth < 8; depth += 1) {
    const [alias] = await tx.select({ currentName: accountNameAliasesTable.currentName })
      .from(accountNameAliasesTable)
      .where(and(
        eq(accountNameAliasesTable.userId, officeId),
        eq(accountNameAliasesTable.scope, scope),
        eq(accountNameAliasesTable.oldName, current),
      ));
    if (!alias) return current;
    const resolved = normalizeAccountName(alias.currentName);
    if (!resolved || resolved === current) return current;
    current = resolved;
  }
  return current;
}

export async function isRetiredAccountName(
  tx: any,
  officeId: number,
  scope: "agent" | "client",
  name: string | undefined,
): Promise<boolean> {
  const normalized = normalizeAccountName(name ?? "");
  return Boolean(normalized) && (await resolveRenamedAccountName(tx, officeId, scope, normalized)) !== normalized;
}

export async function recordAccountRename(
  tx: any,
  officeId: number,
  scope: "agent" | "client",
  oldName: string,
  newName: string,
): Promise<void> {
  const oldCanonical = normalizeAccountName(oldName);
  const newCanonical = normalizeAccountName(newName);
  if (!oldCanonical || !newCanonical || oldCanonical === newCanonical) return;
  if (await isRetiredAccountName(tx, officeId, scope, newCanonical)) {
    throw new Error("لا يمكن إعادة استخدام اسم تم تغييره سابقاً");
  }
  await tx.insert(accountNameAliasesTable).values({
    userId: officeId,
    scope,
    oldName: oldCanonical,
    currentName: newCanonical,
  }).onConflictDoUpdate({
    target: [
      accountNameAliasesTable.userId,
      accountNameAliasesTable.scope,
      accountNameAliasesTable.oldName,
    ],
    set: { currentName: newCanonical },
  });
  await tx.update(accountNameAliasesTable).set({ currentName: newCanonical })
    .where(and(
      eq(accountNameAliasesTable.userId, officeId),
      eq(accountNameAliasesTable.scope, scope),
      eq(accountNameAliasesTable.currentName, oldCanonical),
    ));
}

/**
 * Auto-register the agent (الوكيل) when a transaction references a name that
 * is not yet in the office's agents list — no manual adding from the
 * statement page needed.
 */
export async function ensureAgent(tx: any, officeId: number, agent: string | undefined): Promise<string> {
  const name = await resolveRenamedAccountName(tx, officeId, "agent", agent);
  if (!name) return "";
  await lockAccountNames(tx, officeId, [{ scope: "agent", name }]);
  const [existing] = await tx.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(eq(agentsTable.userId, officeId), sql`btrim(${agentsTable.name}) = ${name}`));
  if (!existing) {
    await tx.insert(agentsTable).values({ userId: officeId, name });
  }
  return name;
}

/**
 * Ensure a client account exists for the given name and (optionally) set its
 * opening balance. Used when saving umrah/visa transactions that reference a
 * client (اسم العميل) — keeps the statement page linked automatically.
 */
export async function ensureClientAccount(
  tx: any,
  officeId: number,
  client: string | undefined,
  openingBalance: number | undefined,
): Promise<string> {
  const name = await resolveRenamedAccountName(tx, officeId, "client", client);
  if (!name) return "";
  await lockAccountNames(tx, officeId, [{ scope: "client", name }]);
  const [existing] = await tx.select().from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = ${name}`));
  if (!existing) {
    await tx.insert(clientAccountsTable).values({
      userId: officeId,
      clientName: name,
      openingBalance: String(openingBalance ?? 0),
    });
  } else if (openingBalance !== undefined && !isNaN(openingBalance)) {
    await tx.update(clientAccountsTable)
      .set({ openingBalance: String(openingBalance) })
      .where(eq(clientAccountsTable.id, existing.id));
  }
  return name;
}
