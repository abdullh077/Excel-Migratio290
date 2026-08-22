import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import {
  agentsTable,
  clientAccountsTable,
  db,
  otherVisasTable,
  pool,
  umrahClientsTable,
  usersTable,
  vouchersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  effectiveVisaClientName,
  ensureAgent,
  ensureClientAccount,
  isRetiredAccountName,
  lockAccountNames,
  recordAccountRename,
} from "./clientAccounts.js";

const suffix = `${Date.now()}-${process.pid}`;
let officeId: number;

async function createOffice(): Promise<number> {
  const [office] = await db.insert(usersTable).values({
    username: `name-lock-test-${suffix}`,
    passwordHash: "test-only",
    role: "owner",
  }).returning({ id: usersTable.id });
  return office.id;
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  let release!: () => void;
  const closed = new Promise<void>((resolve) => { release = resolve; });
  return { opened, closed, open, release };
}

before(async () => {
  officeId = await createOffice();
});

test("renaming an agent waits for an in-flight visa save and retags it", async () => {
  const oldName = `وكيل قديم ${suffix}`;
  const newName = `وكيل جديد ${suffix}`;
  const client = `عميل تأشيرة ${suffix}`;
  await db.insert(agentsTable).values({ userId: officeId, name: oldName });

  const saving = gate();
  const saveVisa = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "agent", name: oldName },
      { scope: "client", name: client },
    ]);
    saving.open();
    await saving.closed;
    await ensureAgent(tx, officeId, oldName);
    await ensureClientAccount(tx, officeId, client, undefined);
    return (await tx.insert(otherVisasTable).values({
      userId: officeId,
      clientName: "حامل الجواز",
      passportNumber: `P-${suffix}`,
      requestNumber: `R-${suffix}`,
      phone: "0500000000",
      agent: oldName,
      client,
      issueDate: "2026-08-22",
      visaType: "زيارة",
      purchasePrice: "100",
      salePrice: "150",
    }).returning())[0];
  });

  await saving.opened;
  const rename = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "agent", name: oldName },
      { scope: "agent", name: newName },
    ]);
    await tx.update(agentsTable).set({ name: newName })
      .where(and(eq(agentsTable.userId, officeId), sql`btrim(${agentsTable.name}) = btrim(${oldName})`));
    await recordAccountRename(tx, officeId, "agent", oldName, newName);
    await tx.update(otherVisasTable).set({ agent: newName })
      .where(and(eq(otherVisasTable.userId, officeId), sql`btrim(${otherVisasTable.agent}) = btrim(${oldName})`));
  });
  saving.release();
  const [visa] = await Promise.all([saveVisa, rename.then(() => null)]);

  const [stored] = await db.select({ agent: otherVisasTable.agent }).from(otherVisasTable)
    .where(eq(otherVisasTable.id, visa.id));
  assert.equal(stored.agent, newName);
});

test("renaming a client waits for an in-flight voucher save and retags it", async () => {
  const oldName = `عميل قديم ${suffix}`;
  const newName = `عميل جديد ${suffix}`;
  await db.insert(clientAccountsTable).values({ userId: officeId, clientName: oldName });

  const saving = gate();
  const saveVoucher = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "client", name: oldName }]);
    saving.open();
    await saving.closed;
    await ensureClientAccount(tx, officeId, oldName, undefined);
    return (await tx.insert(vouchersTable).values({
      userId: officeId,
      kind: "receipt",
      partyType: "client",
      partyName: oldName,
      amount: "75",
      voucherDate: new Date("2026-08-22T00:00:00.000Z"),
    }).returning())[0];
  });

  await saving.opened;
  const rename = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldName },
      { scope: "client", name: newName },
    ]);
    await tx.update(clientAccountsTable).set({ clientName: newName })
      .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${oldName})`));
    await recordAccountRename(tx, officeId, "client", oldName, newName);
    await tx.update(vouchersTable).set({ partyName: newName })
      .where(and(
        eq(vouchersTable.userId, officeId),
        eq(vouchersTable.partyType, "client"),
        sql`btrim(${vouchersTable.partyName}) = btrim(${oldName})`,
      ));
  });
  saving.release();
  const [voucher] = await Promise.all([saveVoucher, rename.then(() => null)]);

  const [stored] = await db.select({ partyName: vouchersTable.partyName }).from(vouchersTable)
    .where(eq(vouchersTable.id, voucher.id));
  const accounts = await db.select({ id: clientAccountsTable.id, clientName: clientAccountsTable.clientName })
    .from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), sql`btrim(${clientAccountsTable.clientName}) = btrim(${newName})`));
  assert.equal(stored.partyName, newName);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].clientName, newName);
});

test("renaming a fallback visa client waits for an in-flight visa save", async () => {
  const oldName = `اسم جواز قديم ${suffix}`;
  const newName = `اسم جواز جديد ${suffix}`;
  const agent = `وكيل بديل ${suffix}`;
  await db.insert(agentsTable).values({ userId: officeId, name: agent });

  const saving = gate();
  const saveVisa = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: effectiveVisaClientName("", oldName) },
      { scope: "agent", name: agent },
    ]);
    saving.open();
    await saving.closed;
    return (await tx.insert(otherVisasTable).values({
      userId: officeId,
      clientName: oldName,
      passportNumber: `P-fallback-${suffix}`,
      requestNumber: `R-fallback-${suffix}`,
      phone: "0500000000",
      agent,
      client: "",
      issueDate: "2026-08-22",
      visaType: "زيارة",
      purchasePrice: "100",
      salePrice: "150",
    }).returning())[0];
  });

  await saving.opened;
  const rename = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldName },
      { scope: "client", name: newName },
    ]);
    await tx.update(otherVisasTable).set({ client: newName })
      .where(and(
        eq(otherVisasTable.userId, officeId),
        sql`btrim(coalesce(nullif(${otherVisasTable.client},''), ${otherVisasTable.clientName})) = btrim(${oldName})`,
      ));
    await recordAccountRename(tx, officeId, "client", oldName, newName);
  });
  saving.release();
  const [visa] = await Promise.all([saveVisa, rename.then(() => null)]);

  const [stored] = await db.select({ client: otherVisasTable.client }).from(otherVisasTable)
    .where(eq(otherVisasTable.id, visa.id));
  assert.equal(stored.client, newName);
});

test("a delayed visa save resolves an agent renamed before it acquires its lock", async () => {
  const oldName = `وكيل تأشيرة مؤجل ${suffix}`;
  const newName = `وكيل تأشيرة محدث ${suffix}`;
  await db.insert(agentsTable).values({ userId: officeId, name: oldName });
  await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "agent", name: oldName },
      { scope: "agent", name: newName },
    ]);
    await tx.update(agentsTable).set({ name: newName })
      .where(and(eq(agentsTable.userId, officeId), eq(agentsTable.name, oldName)));
    await recordAccountRename(tx, officeId, "agent", oldName, newName);
  });

  const visa = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "agent", name: oldName }]);
    const agent = await ensureAgent(tx, officeId, oldName);
    return (await tx.insert(otherVisasTable).values({
      userId: officeId,
      clientName: "حامل جواز مؤجل",
      passportNumber: `P-delayed-${suffix}`,
      requestNumber: `R-delayed-${suffix}`,
      phone: "0500000000",
      agent,
      client: "",
      issueDate: "2026-08-22",
      visaType: "زيارة",
      purchasePrice: "100",
      salePrice: "150",
    }).returning())[0];
  });
  const [stored] = await db.select({ agent: otherVisasTable.agent }).from(otherVisasTable)
    .where(eq(otherVisasTable.id, visa.id));
  const oldAgents = await db.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(eq(agentsTable.userId, officeId), eq(agentsTable.name, oldName)));
  assert.equal(stored.agent, newName);
  assert.equal(oldAgents.length, 0);
});

test("a delayed umrah save resolves a renamed client and agent", async () => {
  const oldClient = `عميل عمرة مؤجل ${suffix}`;
  const newClient = `عميل عمرة محدث ${suffix}`;
  const oldAgent = `وكيل عمرة مؤجل ${suffix}`;
  const newAgent = `وكيل عمرة محدث ${suffix}`;
  await db.insert(clientAccountsTable).values({ userId: officeId, clientName: oldClient });
  await db.insert(agentsTable).values({ userId: officeId, name: oldAgent });
  await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldClient }, { scope: "client", name: newClient },
      { scope: "agent", name: oldAgent }, { scope: "agent", name: newAgent },
    ]);
    await tx.update(clientAccountsTable).set({ clientName: newClient })
      .where(and(eq(clientAccountsTable.userId, officeId), eq(clientAccountsTable.clientName, oldClient)));
    await tx.update(agentsTable).set({ name: newAgent })
      .where(and(eq(agentsTable.userId, officeId), eq(agentsTable.name, oldAgent)));
    await recordAccountRename(tx, officeId, "client", oldClient, newClient);
    await recordAccountRename(tx, officeId, "agent", oldAgent, newAgent);
  });

  const umrah = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldClient }, { scope: "agent", name: oldAgent },
    ]);
    const client = await ensureClientAccount(tx, officeId, oldClient, undefined);
    const agent = await ensureAgent(tx, officeId, oldAgent);
    return (await tx.insert(umrahClientsTable).values({
      userId: officeId,
      clientName: "معتمر مؤجل",
      passportNumber: `U-${suffix}`,
      phone: "0500000000",
      client,
      agent,
      issueDate: "2026-08-22",
      stayDuration: 30,
      purchasePrice: "100",
      salePrice: "150",
    }).returning())[0];
  });
  const [stored] = await db.select({ client: umrahClientsTable.client, agent: umrahClientsTable.agent })
    .from(umrahClientsTable).where(eq(umrahClientsTable.id, umrah.id));
  assert.deepEqual(stored, { client: newClient, agent: newAgent });
});

test("a delayed voucher save resolves a renamed client instead of recreating it", async () => {
  const oldName = `عميل سند مؤجل ${suffix}`;
  const newName = `عميل سند محدث ${suffix}`;
  await db.insert(clientAccountsTable).values({ userId: officeId, clientName: oldName });
  await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldName }, { scope: "client", name: newName },
    ]);
    await tx.update(clientAccountsTable).set({ clientName: newName })
      .where(and(eq(clientAccountsTable.userId, officeId), eq(clientAccountsTable.clientName, oldName)));
    await recordAccountRename(tx, officeId, "client", oldName, newName);
  });

  const voucher = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "client", name: oldName }]);
    const partyName = await ensureClientAccount(tx, officeId, oldName, undefined);
    return (await tx.insert(vouchersTable).values({
      userId: officeId, kind: "receipt", partyType: "client", partyName,
      amount: "75", voucherDate: new Date("2026-08-22T00:00:00.000Z"),
    }).returning())[0];
  });
  const [stored] = await db.select({ partyName: vouchersTable.partyName }).from(vouchersTable)
    .where(eq(vouchersTable.id, voucher.id));
  const oldAccounts = await db.select({ id: clientAccountsTable.id }).from(clientAccountsTable)
    .where(and(eq(clientAccountsTable.userId, officeId), eq(clientAccountsTable.clientName, oldName)));
  assert.equal(stored.partyName, newName);
  assert.equal(oldAccounts.length, 0);
});

test("a retired name remains reserved for openings and unrelated renames", async () => {
  const oldName = `اسم محجوز ${suffix}`;
  const newName = `اسم حالي ${suffix}`;
  const unrelated = `حساب آخر ${suffix}`;
  await db.insert(clientAccountsTable).values({ userId: officeId, clientName: newName });
  await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "client", name: oldName }, { scope: "client", name: newName },
    ]);
    await recordAccountRename(tx, officeId, "client", oldName, newName);
  });

  const canonicalOpeningName = await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "client", name: oldName }]);
    return ensureClientAccount(tx, officeId, oldName, 25);
  });
  assert.equal(canonicalOpeningName, newName);
  await assert.rejects(
    db.transaction(async (tx) => recordAccountRename(tx, officeId, "client", unrelated, oldName)),
    /لا يمكن إعادة استخدام اسم تم تغييره سابقاً/,
  );
  const retired = await db.transaction((tx) => isRetiredAccountName(tx, officeId, "client", oldName));
  assert.equal(retired, true);
});

test("a stale save and rejected rename do not deadlock on a retired alias", async () => {
  const retiredName = `وكيل متقاعد ${suffix}`;
  const currentName = `وكيل حالي ${suffix}`;
  await db.insert(agentsTable).values({ userId: officeId, name: currentName });
  await db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "agent", name: retiredName }, { scope: "agent", name: currentName },
    ]);
    await recordAccountRename(tx, officeId, "agent", retiredName, currentName);
  });

  const saving = gate();
  const staleSave = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [{ scope: "agent", name: retiredName }]);
    saving.open();
    await saving.closed;
    return ensureAgent(tx, officeId, retiredName);
  });
  await saving.opened;
  const rejectedRename = db.transaction(async (tx) => {
    await lockAccountNames(tx, officeId, [
      { scope: "agent", name: currentName }, { scope: "agent", name: retiredName },
    ]);
    return isRetiredAccountName(tx, officeId, "agent", retiredName);
  });
  saving.release();
  const [canonicalAgent, targetIsReserved] = await Promise.all([staleSave, rejectedRename]);
  assert.equal(canonicalAgent, currentName);
  assert.equal(targetIsReserved, true);
});

after(async () => {
  if (officeId) await db.delete(usersTable).where(eq(usersTable.id, officeId));
  await pool.end();
});