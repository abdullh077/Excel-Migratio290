// Coverage for the offline write-queue's core sync scenarios — the ones a
// human reviewer can't easily eyeball because they only manifest once a
// device goes offline, queues several writes, and later reconnects:
//   1. queued writes replay in enqueue order, not IndexedDB iteration order
//   2. a create + a dependent op queued before the create ever synced gets
//      the dependent op's temp-id references substituted with the real id
//   3. a permanent (validation) failure on one op never blocks an
//      independent op later in the same queue
//   4. retrying a create whose response was lost resends the same
//      clientRequestId, so a server-side idempotent create is never
//      duplicated client-side either
//
// Run with: `pnpm --filter @workspace/visa-manager test`

import "fake-indexeddb/auto";

// Node has a minimal global `navigator` (userAgent only) with no `onLine`,
// which flushOutbox would read as "offline" and refuse to run at all.
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});

import assert from "node:assert/strict";
import test from "node:test";

import { enqueue, flushOutbox, type OutboxRecord } from "./outbox";
import { idbGetAll, STORE_OUTBOX } from "./idb";
import { saveIdentity } from "./authCache";

let nextOfficeId = 1;
/** Fresh office id per test so records/state from earlier tests can never leak in. */
function freshOfficeId(): number {
  return nextOfficeId++;
}

async function useOffice(officeId: number): Promise<void> {
  await saveIdentity({ id: officeId, username: `office-${officeId}`, role: "owner", officeId });
}

async function outboxFor(officeId: number): Promise<OutboxRecord[]> {
  const all = await idbGetAll<OutboxRecord>(STORE_OUTBOX);
  return all.filter((r) => r.officeId === officeId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

type MockResult = { status: number; body?: any } | "network-error";

interface FetchCall {
  url: string;
  method: string;
  body: any;
}

/** Installs a scripted global.fetch that answers each call in order. */
function mockFetch(results: MockResult[]): FetchCall[] {
  const calls: FetchCall[] = [];
  let i = 0;
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", body });
    const result = results[i++];
    if (!result) throw new Error(`unexpected extra fetch call: ${init.method ?? "GET"} ${url}`);
    if (result === "network-error") throw new TypeError("Failed to fetch");
    return new Response(result.body !== undefined ? JSON.stringify(result.body) : undefined, { status: result.status });
  };
  return calls;
}

test("in-order replay: queued writes hit the server in the order they were enqueued", async () => {
  const officeId = freshOfficeId();
  await useOffice(officeId);

  await enqueue({ id: "op-1", officeId, method: "POST", url: "/api/statement/ledger", body: { description: "first" }, label: "قيد 1", cross: [] });
  await enqueue({ id: "op-2", officeId, method: "POST", url: "/api/statement/ledger", body: { description: "second" }, label: "قيد 2", cross: [] });
  await enqueue({ id: "op-3", officeId, method: "POST", url: "/api/statement/ledger", body: { description: "third" }, label: "قيد 3", cross: [] });

  const calls = mockFetch([
    { status: 201, body: { id: 101 } },
    { status: 201, body: { id: 102 } },
    { status: 201, body: { id: 103 } },
  ]);

  await flushOutbox();

  assert.deepEqual(calls.map((c) => c.body.description), ["first", "second", "third"]);
  assert.deepEqual(await outboxFor(officeId), [], "every op should have been removed from the queue after syncing");
});

test("temp-id substitution: an op referencing a not-yet-synced create's temp id gets the real id once the create succeeds", async () => {
  const officeId = freshOfficeId();
  await useOffice(officeId);

  // Simulates: offline, create an agent, then immediately record a payment
  // to that same agent before the create ever reached the server — the
  // payment's URL is built with the agent's temp id because no real id
  // exists yet.
  const tempAgentId = "offline-agent-temp-1";
  await enqueue({
    id: "op-create-agent",
    officeId,
    method: "POST",
    url: "/api/statement/agents",
    body: { name: "وكيل جديد", clientRequestId: tempAgentId },
    label: "إضافة وكيل",
    tempId: tempAgentId,
    cross: [],
    selfResource: "agents",
  });
  await enqueue({
    id: "op-pay-agent",
    officeId,
    method: "POST",
    url: `/api/statement/agents/${tempAgentId}/payments`,
    body: { amount: 500, direction: "to_agent" },
    label: "دفعة للوكيل",
    cross: [],
  });

  const calls = mockFetch([
    { status: 201, body: { id: 42, name: "وكيل جديد" } },
    { status: 201, body: { id: 900 } },
  ]);

  await flushOutbox();

  assert.equal(calls[0].url, "/api/statement/agents");
  assert.equal(calls[1].url, "/api/statement/agents/42/payments", "the temp id must be substituted with the real agent id returned by the create");
  assert.deepEqual(await outboxFor(officeId), []);
});

test("permanent failure isolation: a rejected op is marked failed without blocking an independent later op", async () => {
  const officeId = freshOfficeId();
  await useOffice(officeId);

  await enqueue({ id: "op-bad", officeId, method: "POST", url: "/api/statement/agents", body: { name: "" }, label: "وكيل غير صالح", cross: [] });
  await enqueue({ id: "op-good", officeId, method: "POST", url: "/api/statement/ledger", body: { description: "قيد مستقل" }, label: "قيد مستقل", cross: [] });

  const calls = mockFetch([
    { status: 400, body: { error: "اسم الوكيل يجب أن يتكون من حرفين على الأقل" } },
    { status: 201, body: { id: 7 } },
  ]);

  await flushOutbox();

  assert.equal(calls.length, 2, "the independent op after the failed one must still be attempted");
  const remaining = await outboxFor(officeId);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "op-bad");
  assert.equal(remaining[0].status, "failed");
  assert.match(remaining[0].error ?? "", /حرفين/);
});

test("idempotent replay: a create retried after a lost response is never resent as a different request or left duplicated", async () => {
  const officeId = freshOfficeId();
  await useOffice(officeId);

  const tempId = "offline-voucher-temp-1";
  await enqueue({
    id: "op-voucher",
    officeId,
    method: "POST",
    url: "/api/vouchers",
    body: { kind: "receipt", partyType: "client", partyName: "عميل تجريبي", amount: 100, clientRequestId: tempId },
    label: "سند قبض",
    tempId,
    cross: [],
    selfResource: "vouchers",
  });

  // First flush: the request may have actually reached the server (which
  // would have stored it under this clientRequestId), but the response
  // never made it back — a plain network error from the client's point of
  // view. The op must stay queued, not be silently dropped.
  mockFetch(["network-error"]);
  await flushOutbox();
  let remaining = await outboxFor(officeId);
  assert.equal(remaining.length, 1, "a lost response must leave the op queued for retry, not drop it");
  assert.equal(remaining[0].status, "pending");

  // Retry: outbox.ts must resend the exact same stored body — including the
  // same clientRequestId — so the server's onConflictDoNothing/dedupe path
  // returns the already-created row instead of creating a second voucher.
  const calls = mockFetch([{ status: 201, body: { id: 55 } }]);
  await flushOutbox();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.clientRequestId, tempId, "retry must carry the same clientRequestId as the original attempt");
  remaining = await outboxFor(officeId);
  assert.deepEqual(remaining, [], "once the (idempotent) create is acknowledged, the op must be removed exactly once");
});
