// The IndexedDB response cache is what the UI actually renders while
// offline (and immediately after a write, before the next real fetch) — so
// if applySelfOp/applyCrossPatches drift from the real formulas, staff see
// a wrong balance on screen even though the eventual server-side number
// would have been correct. This exercises a realistic offline batch
// (create agent → create umrah for that agent → pay the agent) entirely
// through the cache layer and checks the agent's cached balance matches
// hand-computed expectations after every step, the same way the UI would
// read it back.
//
// Run with: `pnpm --filter @workspace/visa-manager test`

import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import test from "node:test";

import { readCache, writeCache, applySelfOp, applyCrossPatches } from "./cache";
import { planMutation } from "./affects";

let nextOfficeId = 1000;
function freshOfficeId(): number {
  return nextOfficeId++;
}

/** Mimics what offlineFetch does for a single queued write: plan, then apply self + cross patches. */
async function applyOfflineWrite(officeId: number, method: string, path: string, body: any, tempId: string, hint?: { priorRow?: any }) {
  const plan = planMutation(method, path, body, tempId, hint);
  assert.ok(plan, `expected a mutation plan for ${method} ${path}`);
  await applySelfOp(plan!.self, officeId);
  await applyCrossPatches(plan!.cross, officeId);
  return plan!;
}

test("a batch of queued offline writes keeps the cached agent balance correct at every step", async () => {
  const officeId = freshOfficeId();

  // Seed the agent list cache the way a real GET /statement/agents response would look before going offline.
  await writeCache(officeId, "/api/statement/agents", []);

  // 1) Create the agent while offline.
  const createPlan = await applyOfflineWrite(officeId, "POST", "/api/statement/agents", { name: "وكيل الدفعة", openingBalance: 0 }, "tmp-agent");
  let agents = await readCache(officeId, "/api/statement/agents");
  assert.equal(agents.length, 1);
  assert.equal(agents[0].balance, 0);

  // 2) Record an umrah purchase for that agent (still offline) — agent owes nothing extra yet in cash terms,
  // but totalPurchases rises and balance drops by the purchase price (موجب = عليه، فالشراء يخفّض المتبقي له).
  await applyOfflineWrite(officeId, "POST", "/api/umrah", { agent: "وكيل الدفعة", client: "", purchasePrice: 1000, salePrice: 1500 }, "tmp-umrah");
  agents = await readCache(officeId, "/api/statement/agents");
  assert.equal(agents[0].totalPurchases, 1000);
  assert.equal(agents[0].balance, -1000);

  // 3) Pay the agent 400 (still offline) — paidTo increases the balance back toward zero.
  // Real code resolves the real agent id first; here we simulate the same shape offlineFetch would
  // produce once outbox.ts substitutes the create's temp id for the real one.
  const paymentPlan = planMutation(
    "POST",
    `/api/statement/agents/${createPlan.self.kind === "create" ? createPlan.self.tempId : ""}/payments`,
    { amount: 400, direction: "to_agent" },
    "tmp-payment",
    { priorRow: agents[0] },
  );
  assert.ok(paymentPlan);
  await applyCrossPatches(paymentPlan!.cross, officeId);
  agents = await readCache(officeId, "/api/statement/agents");
  assert.equal(agents[0].paidTo, 400);
  assert.equal(agents[0].balance, -600, "opening(0) + paidTo(400) - totalPurchases(1000) = -600, mirroring computeAgentBalance");

  // 4) The purchase is later edited down to 700 before ever syncing — balance must reflect the new total, not double-count.
  await applyOfflineWrite(
    officeId,
    "PUT",
    "/api/umrah/tmp-umrah",
    { agent: "وكيل الدفعة", client: "", purchasePrice: 700, salePrice: 1500 },
    "tmp-umrah-edit",
    { priorRow: { agent: "وكيل الدفعة", client: "", purchasePrice: 1000, salePrice: 1500 } },
  );
  agents = await readCache(officeId, "/api/statement/agents");
  assert.equal(agents[0].totalPurchases, 700);
  assert.equal(agents[0].balance, -300, "opening(0) + paidTo(400) - totalPurchases(700) = -300");
});

test("applySelfOp only patches flat list caches, leaving unrelated cached resources untouched", async () => {
  const officeId = freshOfficeId();
  await writeCache(officeId, "/api/statement/agents", [{ id: 1, name: "أ", balance: 0 }]);
  await writeCache(officeId, "/api/statement/clients", [{ clientName: "ب", balance: 0 }]);

  await applyCrossPatches([{ resource: "agents", matchField: "name", matchValue: "أ", add: { balance: 50 } }], officeId);

  const agents = await readCache(officeId, "/api/statement/agents");
  const clients = await readCache(officeId, "/api/statement/clients");
  assert.equal(agents[0].balance, 50);
  assert.equal(clients[0].balance, 0, "a cross-patch targeting agents must never leak into the clients cache");
});
