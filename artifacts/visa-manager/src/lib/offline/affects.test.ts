// planMutation() computes the optimistic self-patch and cross-entity balance
// deltas applied locally while a write is queued offline. Its formulas are
// documented (in affects.ts) as mirroring the server's real balance math
// exactly — if they drift apart, staff see one (wrong) number offline and a
// different (correct) one after the next sync, which reads as "the balance
// changed for no reason". These tests pin the formulas for the money-moving
// mutations so a change to one side is caught here instead of by a user.
//
// Run with: `pnpm --filter @workspace/visa-manager test`

import assert from "node:assert/strict";
import test from "node:test";

import { planMutation } from "./affects";

function crossFor(cross: any[], resource: string, matchValue: string) {
  return cross.find((c: any) => c.resource === resource && c.matchValue === matchValue);
}

test("creating an umrah transaction debits the agent's purchases and credits the client's sales", () => {
  const plan = planMutation("POST", "/api/umrah", { agent: "وكيل أ", client: "عميل ب", purchasePrice: 1000, salePrice: 1500 }, "tmp-1");
  assert.ok(plan);
  const agentPatch = crossFor(plan!.cross, "agents", "وكيل أ");
  const clientPatch = crossFor(plan!.cross, "clients", "عميل ب");
  // موجب = عليه (للمكتب) في حساب الوكيل — الشراء يزيد ما يستحقه الوكيل، لذا الرصيد ينخفض.
  assert.deepEqual(agentPatch.add, { totalPurchases: 1000, balance: -1000 });
  assert.deepEqual(clientPatch.add, { totalSales: 1500, balance: 1500 });
});

test("editing an umrah transaction reverses the prior amounts before applying the new ones", () => {
  const prior = { agent: "وكيل أ", client: "عميل ب", purchasePrice: 1000, salePrice: 1500 };
  const plan = planMutation("PUT", "/api/umrah/42", { agent: "وكيل أ", client: "عميل ب", purchasePrice: 1200, salePrice: 1500 }, "tmp-2", { priorRow: prior });
  assert.ok(plan);
  const agentPatch = crossFor(plan!.cross, "agents", "وكيل أ");
  // Two entries are emitted for the same agent: -1000 (reverse old) then +1200 (apply new) → net +200.
  const netAgentPurchases = plan!.cross.filter((c: any) => c.resource === "agents" && c.matchValue === "وكيل أ").reduce((s: number, c: any) => s + (c.add?.totalPurchases ?? 0), 0);
  assert.equal(netAgentPurchases, 200, "only the purchase-price delta (1200-1000) should net out, not the full new amount");
  assert.ok(agentPatch);
});

test("editing an umrah transaction with unchanged amounts nets to zero (idempotent no-op on balance)", () => {
  const prior = { agent: "وكيل أ", client: "عميل ب", purchasePrice: 1000, salePrice: 1500 };
  const plan = planMutation("PUT", "/api/umrah/42", { agent: "وكيل أ", client: "عميل ب", purchasePrice: 1000, salePrice: 1500, notes: "تعديل ملاحظة فقط" }, "tmp-3", { priorRow: prior });
  assert.ok(plan);
  const netAgentBalance = plan!.cross.filter((c: any) => c.resource === "agents" && c.matchValue === "وكيل أ").reduce((s: number, c: any) => s + (c.add?.balance ?? 0), 0);
  const netClientBalance = plan!.cross.filter((c: any) => c.resource === "clients" && c.matchValue === "عميل ب").reduce((s: number, c: any) => s + (c.add?.balance ?? 0), 0);
  assert.equal(netAgentBalance, 0);
  assert.equal(netClientBalance, 0);
});

test("deleting an umrah transaction reverses its full amounts", () => {
  const prior = { agent: "وكيل أ", client: "عميل ب", purchasePrice: 1000, salePrice: 1500 };
  const plan = planMutation("DELETE", "/api/umrah/42", {}, "tmp-4", { priorRow: prior });
  assert.ok(plan);
  const agentPatch = crossFor(plan!.cross, "agents", "وكيل أ");
  const clientPatch = crossFor(plan!.cross, "clients", "عميل ب");
  assert.deepEqual(agentPatch.add, { totalPurchases: -1000, balance: 1000 });
  assert.deepEqual(clientPatch.add, { totalSales: -1500, balance: -1500 });
});

test("a visa's transferredToAgent reduces what the agent is owed, separately from the purchase price", () => {
  const plan = planMutation("POST", "/api/visas", { agent: "وكيل ج", client: "عميل د", purchasePrice: 800, salePrice: 1200, receivedFromClient: 200, transferredToAgent: 300 }, "tmp-5");
  assert.ok(plan);
  const agentPatch = crossFor(plan!.cross, "agents", "وكيل ج");
  const clientPatch = crossFor(plan!.cross, "clients", "عميل د");
  assert.deepEqual(agentPatch.add, { totalPurchases: 800, transferred: 300, balance: 300 - 800 });
  assert.deepEqual(clientPatch.add, { totalSales: 1200, totalReceived: 200, balance: 1200 - 200 });
});

test("recording an opening balance patches only the balance delta, not the full new amount", () => {
  const plan = planMutation("POST", "/api/statement/opening", { partyType: "agent", name: "وكيل هـ", amount: 500 }, "tmp-6", { priorRow: { openingBalance: 100 } });
  assert.ok(plan);
  const patch = crossFor(plan!.cross, "agents", "وكيل هـ");
  assert.deepEqual(patch.add, { balance: 400, openingBalance: 400 });
});

test("an unknown endpoint returns null instead of silently pretending success", () => {
  assert.equal(planMutation("POST", "/api/some/future/endpoint", {}, "tmp-7"), null);
});
