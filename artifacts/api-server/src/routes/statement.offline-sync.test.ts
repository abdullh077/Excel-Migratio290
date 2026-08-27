// Integration coverage for "does the balance stay correct after a batch of
// queued offline writes is flushed": every create in this batch is sent the
// way outbox.ts actually sends it (POST/PUT with a client-generated
// clientRequestId), including a same-body retry to simulate a flush where
// the response was lost the first time — the case that risks a duplicated
// record and a doubled balance if server-side dedupe (onConflictDoNothing +
// "return the existing row") is ever broken by a future change.
//
// Run with: `pnpm --filter @workspace/api-server test`

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import http from "node:http";
import bcrypt from "bcryptjs";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app.js";

const suffix = `${Date.now()}-${process.pid}`;
const username = `offline-sync-test-${suffix}`;
const password = "Test-Password-123!";

let server: http.Server;
let baseUrl: string;
let officeId: number;
let sessionCookie: string;

before(async () => {
  const passwordHash = await bcrypt.hash(password, 4);
  const [office] = await db.insert(usersTable).values({
    username,
    passwordHash,
    role: "owner",
  }).returning({ id: usersTable.id });
  officeId = office.id;

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind test server");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(loginRes.status, 200, "test office login must succeed before any of these tests can run");
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("login did not return a session cookie");
  sessionCookie = setCookie.split(";")[0];
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(usersTable).where(eq(usersTable.id, officeId));
  await pool.end();
});

async function api(method: string, path: string, body?: any): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

test("agent balance stays correct after a replayed offline batch (create agent + purchase + payment, each retried once)", async () => {
  const agentName = `وكيل مزامنة ${suffix}`;

  // 1) Create the agent — then retry with the same clientRequestId, exactly
  // like outbox.ts resending a queued create whose response never arrived.
  const createReqId = `offline-agent-${suffix}`;
  const create1 = await api("POST", "/api/statement/agents", { name: agentName, openingBalance: 0, clientRequestId: createReqId });
  const create2 = await api("POST", "/api/statement/agents", { name: agentName, openingBalance: 0, clientRequestId: createReqId });
  assert.equal(create1.status, 201);
  assert.equal(create2.status, 201);
  assert.equal(create2.json.id, create1.json.id, "a retried create with the same clientRequestId must return the same row, not a duplicate");
  const agentId = create1.json.id;

  // 2) Queue an umrah purchase for that agent, retried the same way.
  const umrahReqId = `offline-umrah-${suffix}`;
  const umrahBody = {
    clientName: `معتمر ${suffix}`,
    passportNumber: `P-${suffix}`,
    phone: "0500000001",
    agent: agentName,
    client: "",
    issueDate: "2026-08-20",
    stayDuration: 30,
    purchasePrice: 1000,
    salePrice: 1500,
    sendStatus: "لم يرسل",
    clientRequestId: umrahReqId,
  };
  const umrah1 = await api("POST", "/api/umrah", umrahBody);
  const umrah2 = await api("POST", "/api/umrah", umrahBody);
  assert.equal(umrah1.status, 201);
  assert.equal(umrah2.status, 201);
  assert.equal(umrah2.json.id, umrah1.json.id, "a retried umrah create must not create a second transaction");

  // 3) Pay the agent, also retried once.
  const paymentReqId = `offline-payment-${suffix}`;
  const paymentBody = { amount: 400, direction: "to_agent", clientRequestId: paymentReqId };
  const payment1 = await api("POST", `/api/statement/agents/${agentId}/payments`, paymentBody);
  const payment2 = await api("POST", `/api/statement/agents/${agentId}/payments`, paymentBody);
  assert.equal(payment1.status, 201);
  assert.equal(payment2.status, 201);
  assert.equal(payment2.json.id, payment1.json.id, "a retried payment create must not create a second payment");

  // The batch, if double-applied even once, would show totalPurchases=2000
  // and/or paidTo=800. The correct one-time result:
  // balance = opening(0) + transferred(0) + paidTo(400) - totalPurchases(1000) - paidFrom(0) = -600.
  const details = await api("GET", `/api/statement/agents/${agentId}`);
  assert.equal(details.status, 200);
  assert.equal(details.json.totals.totalPurchases, 1000, "the purchase must be counted exactly once despite the retried create");
  assert.equal(details.json.totals.paidTo, 400, "the payment must be counted exactly once despite the retried create");
  assert.equal(details.json.totals.balance, -600);
  assert.equal(details.json.totals.count, 1, "exactly one umrah transaction, not two");
  assert.equal(details.json.payments.length, 1, "exactly one payment, not two");

  const list = await api("GET", "/api/statement/agents");
  const listed = list.json.find((a: any) => a.id === agentId);
  assert.ok(listed, "the agent must appear in the list endpoint");
  assert.equal(listed.balance, -600, "the list endpoint's balance must match the detail endpoint's balance");

  // 4) Editing the purchase price before the *edit* ever synced (client + edit both queued offline) must
  // also converge to the single correct value once both replay, not stack on top of a stale intermediate one.
  const editBody = { ...umrahBody, purchasePrice: 1200, clientRequestId: undefined };
  const edited = await api("PUT", `/api/umrah/${umrah1.json.id}`, editBody);
  assert.equal(edited.status, 200);
  const afterEdit = await api("GET", `/api/statement/agents/${agentId}`);
  assert.equal(afterEdit.json.totals.totalPurchases, 1200);
  assert.equal(afterEdit.json.totals.balance, 400 - 1200);
});

test("client balance stays correct after a replayed offline batch (visa sale + voucher receipt, each retried once)", async () => {
  const clientName = `عميل مزامنة ${suffix}`;
  const agentName = `وكيل تأشيرة مزامنة ${suffix}`;

  const visaReqId = `offline-visa-${suffix}`;
  const visaBody = {
    clientName,
    passportNumber: `PV-${suffix}`,
    requestNumber: `RV-${suffix}`,
    phone: "0500000002",
    agent: agentName,
    client: clientName,
    issueDate: "2026-08-21",
    visaType: "زيارة",
    purchasePrice: 500,
    salePrice: 900,
    receivedFromClient: 300,
    transferredToAgent: 100,
    clientRequestId: visaReqId,
  };
  const visa1 = await api("POST", "/api/visas", visaBody);
  const visa2 = await api("POST", "/api/visas", visaBody);
  assert.equal(visa1.status, 201);
  assert.equal(visa2.status, 201);
  assert.equal(visa2.json.id, visa1.json.id, "a retried visa create must not create a second transaction");

  const voucherReqId = `offline-voucher-${suffix}`;
  const voucherBody = { kind: "receipt", partyType: "client", partyName: clientName, amount: 200, clientRequestId: voucherReqId };
  const voucher1 = await api("POST", "/api/vouchers", voucherBody);
  const voucher2 = await api("POST", "/api/vouchers", voucherBody);
  assert.equal(voucher1.status, 201);
  assert.equal(voucher2.status, 201);
  assert.equal(voucher2.json.id, voucher1.json.id, "a retried voucher create must not create a second voucher");

  // balance = Σ(sale - received) + (voucherPayments - voucherReceipts) = (900-300) + (0-200) = 400.
  // Double-applying either create even once would inflate totalSales/voucherReceipts and shift this number.
  const clients = await api("GET", "/api/statement/clients");
  const found = clients.json.find((c: any) => c.clientName === clientName);
  assert.ok(found, "the client must appear in the statement/clients list");
  assert.equal(found.totalSales, 900);
  assert.equal(found.totalReceived, 300);
  assert.equal(found.voucherReceipts, 200);
  assert.equal(found.txCount, 1, "exactly one visa transaction, not two");
  assert.equal(found.balance, 400);
});
