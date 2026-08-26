// Cross-entity "delta" planner: given a write request that failed due to being
// offline, decides (a) how to patch the mutated entity's own cached list
// (self-patch) and (b) how to patch OTHER cached lists whose displayed
// numbers depend on it — e.g. adding an Umrah transaction for agent "X"
// must immediately bump agent X's cached balance in the statement page,
// even though that number is normally computed server-side.
//
// These formulas mirror the exact server math in
// artifacts/api-server/src/routes/statement.ts (computeAgentBalance, the
// /statement/clients aggregation) — kept in one place so future changes to
// either side can be cross-checked.

export type CrossPatch = {
  resource: "agents" | "clients";
  matchField: "name" | "clientName";
  matchValue: string;
  add?: Record<string, number>;
};

export type SelfOp =
  | { kind: "create"; resource: string; tempId: string; row: any }
  | { kind: "update"; resource: string; matchId: string | number; matchOn?: "id" | "clientName" | "manualId"; patch: any }
  | { kind: "delete"; resource: string; matchId: string | number; matchOn?: "id" | "clientName" | "manualId" };

export interface MutationPlan {
  self: SelfOp;
  cross: CrossPatch[];
  response: { status: number; body: any };
}

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function trimmed(v: any): string {
  return typeof v === "string" ? v.trim() : "";
}

function computeUmrahStatus(stayDuration: number, entryDate: string | null): string {
  if (!entryDate) return "خارج المملكة";
  const entry = new Date(entryDate);
  if (isNaN(entry.getTime())) return "خارج المملكة";
  const daysInside = Math.floor((Date.now() - entry.getTime()) / 86400000);
  return daysInside < stayDuration ? "داخل المملكة" : "خارج المملكة";
}

/**
 * `hint.priorRow` — the row being edited/deleted, as currently shown in the
 * UI (the caller already has it in memory; this avoids re-deriving it from
 * nested/aggregate caches). Required for PUT/DELETE calls that affect an
 * agent or client balance; optional otherwise.
 */
export function planMutation(
  method: string,
  path: string,
  body: any,
  tempId: string,
  hint?: { priorRow?: any },
): MutationPlan | null {
  const m = method.toUpperCase();
  const nowIso = new Date().toISOString();
  const prior = hint?.priorRow;

  // ---- Umrah ----
  if (m === "POST" && /^\/api\/umrah$/.test(path)) {
    const purchase = num(body.purchasePrice);
    const sale = num(body.salePrice);
    const agent = trimmed(body.agent);
    const client = trimmed(body.client);
    const cross: CrossPatch[] = [];
    if (agent) cross.push({ resource: "agents", matchField: "name", matchValue: agent, add: { totalPurchases: purchase, balance: -purchase } });
    if (client) cross.push({ resource: "clients", matchField: "clientName", matchValue: client, add: { totalSales: sale, balance: sale } });
    const row = {
      ...body,
      id: tempId,
      purchasePrice: purchase,
      salePrice: sale,
      profit: sale - purchase,
      status: computeUmrahStatus(num(body.stayDuration), body.entryDate ?? null),
      createdAt: nowIso,
      clientRequestId: tempId,
      __pending: true,
    };
    return { self: { kind: "create", resource: "umrah", tempId, row }, cross, response: { status: 201, body: row } };
  }
  if ((m === "PUT" || m === "DELETE") && /^\/api\/umrah\/([^/]+)$/.test(path)) {
    const id = path.match(/^\/api\/umrah\/([^/]+)$/)![1];
    const cross: CrossPatch[] = [];
    if (prior) {
      const oldAgent = trimmed(prior.agent);
      const oldClient = trimmed(prior.client);
      if (oldAgent) cross.push({ resource: "agents", matchField: "name", matchValue: oldAgent, add: { totalPurchases: -num(prior.purchasePrice), balance: num(prior.purchasePrice) } });
      if (oldClient) cross.push({ resource: "clients", matchField: "clientName", matchValue: oldClient, add: { totalSales: -num(prior.salePrice), balance: -num(prior.salePrice) } });
    }
    if (m === "DELETE") {
      return { self: { kind: "delete", resource: "umrah", matchId: id }, cross, response: { status: 200, body: { message: "Deleted" } } };
    }
    const purchase = num(body.purchasePrice);
    const sale = num(body.salePrice);
    const agent = trimmed(body.agent);
    const client = trimmed(body.client);
    if (agent) cross.push({ resource: "agents", matchField: "name", matchValue: agent, add: { totalPurchases: purchase, balance: -purchase } });
    if (client) cross.push({ resource: "clients", matchField: "clientName", matchValue: client, add: { totalSales: sale, balance: sale } });
    const row = { ...prior, ...body, id, purchasePrice: purchase, salePrice: sale, profit: sale - purchase, status: computeUmrahStatus(num(body.stayDuration ?? prior?.stayDuration), body.entryDate ?? prior?.entryDate ?? null), __pending: true };
    return { self: { kind: "update", resource: "umrah", matchId: id, patch: row }, cross, response: { status: 200, body: row } };
  }

  // ---- Other visas ----
  if (m === "POST" && /^\/api\/visas$/.test(path)) {
    const purchase = num(body.purchasePrice);
    const sale = num(body.salePrice);
    const received = num(body.receivedFromClient);
    const transferred = num(body.transferredToAgent);
    const agent = trimmed(body.agent);
    const client = trimmed(body.client);
    const cross: CrossPatch[] = [];
    if (agent) cross.push({ resource: "agents", matchField: "name", matchValue: agent, add: { totalPurchases: purchase, transferred, balance: transferred - purchase } });
    if (client) cross.push({ resource: "clients", matchField: "clientName", matchValue: client, add: { totalSales: sale, totalReceived: received, balance: sale - received } });
    const row = { ...body, id: tempId, purchasePrice: purchase, salePrice: sale, receivedFromClient: received, transferredToAgent: transferred, profit: sale - purchase, createdAt: nowIso, clientRequestId: tempId, __pending: true };
    return { self: { kind: "create", resource: "visas", tempId, row }, cross, response: { status: 201, body: row } };
  }
  if ((m === "PUT" || m === "DELETE") && /^\/api\/visas\/([^/]+)$/.test(path)) {
    const id = path.match(/^\/api\/visas\/([^/]+)$/)![1];
    const cross: CrossPatch[] = [];
    if (prior) {
      const oldAgent = trimmed(prior.agent);
      const oldClient = trimmed(prior.client);
      if (oldAgent) cross.push({ resource: "agents", matchField: "name", matchValue: oldAgent, add: { totalPurchases: -num(prior.purchasePrice), transferred: -num(prior.transferredToAgent), balance: num(prior.purchasePrice) - num(prior.transferredToAgent) } });
      if (oldClient) cross.push({ resource: "clients", matchField: "clientName", matchValue: oldClient, add: { totalSales: -num(prior.salePrice), totalReceived: -num(prior.receivedFromClient), balance: num(prior.receivedFromClient) - num(prior.salePrice) } });
    }
    if (m === "DELETE") {
      return { self: { kind: "delete", resource: "visas", matchId: id }, cross, response: { status: 200, body: { message: "Deleted" } } };
    }
    const purchase = num(body.purchasePrice);
    const sale = num(body.salePrice);
    const received = num(body.receivedFromClient);
    const transferred = num(body.transferredToAgent);
    const agent = trimmed(body.agent);
    const client = trimmed(body.client);
    if (agent) cross.push({ resource: "agents", matchField: "name", matchValue: agent, add: { totalPurchases: purchase, transferred, balance: transferred - purchase } });
    if (client) cross.push({ resource: "clients", matchField: "clientName", matchValue: client, add: { totalSales: sale, totalReceived: received, balance: sale - received } });
    const row = { ...prior, ...body, id, purchasePrice: purchase, salePrice: sale, receivedFromClient: received, transferredToAgent: transferred, profit: sale - purchase, __pending: true };
    return { self: { kind: "update", resource: "visas", matchId: id, patch: row }, cross, response: { status: 200, body: row } };
  }

  // ---- Agents (statement) ----
  if (m === "POST" && /^\/api\/statement\/agents$/.test(path)) {
    const opening = num(body.openingBalance);
    const row = { id: tempId, name: trimmed(body.name), phone: body.phone ?? null, notes: body.notes ?? null, openingBalance: opening, totalPurchases: 0, transferred: 0, paidFrom: 0, paidTo: 0, balance: opening, txCount: 0, createdAt: nowIso, __pending: true };
    return { self: { kind: "create", resource: "agents", tempId, row }, cross: [], response: { status: 201, body: row } };
  }
  if ((m === "PUT" || m === "DELETE") && /^\/api\/statement\/agents\/([^/]+)$/.test(path)) {
    const id = path.match(/^\/api\/statement\/agents\/([^/]+)$/)![1];
    if (m === "DELETE") return { self: { kind: "delete", resource: "agents", matchId: id }, cross: [], response: { status: 200, body: { message: "Deleted" } } };
    const oldOpening = num(prior?.openingBalance);
    const newOpening = body.openingBalance === undefined ? oldOpening : num(body.openingBalance);
    const row = { ...prior, name: trimmed(body.name), phone: body.phone ?? null, notes: body.notes ?? null, openingBalance: newOpening, balance: num(prior?.balance) + (newOpening - oldOpening), __pending: true };
    return { self: { kind: "update", resource: "agents", matchId: id, patch: row }, cross: [], response: { status: 200, body: row } };
  }
  if (m === "POST" && /^\/api\/statement\/agents\/([^/]+)\/payments$/.test(path)) {
    const agentId = path.match(/^\/api\/statement\/agents\/([^/]+)\/payments$/)![1];
    const amount = num(body.amount);
    const isFrom = body.direction === "from_agent";
    const cross: CrossPatch[] = [{ resource: "agents", matchField: "name", matchValue: prior?.name ?? "", add: isFrom ? { paidFrom: amount, balance: -amount } : { paidTo: amount, balance: amount } }];
    const row = { id: tempId, agentId, amount, direction: body.direction, paidAt: body.paidAt ?? nowIso, notes: body.notes ?? null, voucherId: null, createdAt: nowIso, clientRequestId: tempId, __pending: true };
    return { self: { kind: "create", resource: `agentPayments:${agentId}`, tempId, row }, cross, response: { status: 201, body: row } };
  }
  if (m === "DELETE" && /^\/api\/statement\/payments\/([^/]+)$/.test(path)) {
    const id = path.match(/^\/api\/statement\/payments\/([^/]+)$/)![1];
    const cross: CrossPatch[] = [];
    if (prior) {
      const amount = num(prior.amount);
      const isFrom = prior.direction === "from_agent";
      cross.push({ resource: "agents", matchField: "name", matchValue: prior.agentName ?? "", add: isFrom ? { paidFrom: -amount, balance: amount } : { paidTo: -amount, balance: -amount } });
    }
    return { self: { kind: "delete", resource: `agentPayments:${prior?.agentId ?? "?"}`, matchId: id }, cross, response: { status: 200, body: { message: "Deleted" } } };
  }

  // ---- Clients (statement) ----
  if (m === "POST" && /^\/api\/statement\/clients$/.test(path)) {
    const row = { id: tempId, clientName: trimmed(body.clientName), phone: body.phone ?? null, notes: body.notes ?? null, openingBalance: 0, totalSales: 0, totalReceived: 0, balance: 0, txCount: 0, voucherReceipts: 0, voucherPayments: 0, manualId: tempId, __pending: true };
    return { self: { kind: "create", resource: "clients", tempId, row }, cross: [], response: { status: 201, body: { id: tempId, clientName: row.clientName, phone: row.phone, notes: row.notes } } };
  }
  if (m === "PUT" && /^\/api\/statement\/clients$/.test(path)) {
    // body: { oldName, newName, phone, notes, openingBalance }
    // The clients list has no numeric id — rows are keyed by clientName, so
    // the self-patch must match on the OLD name (matchOn: "clientName").
    const oldOpening = num(prior?.openingBalance);
    const newOpening = body.openingBalance === undefined ? oldOpening : num(body.openingBalance);
    const row = { ...prior, clientName: trimmed(body.newName), phone: body.phone ?? null, notes: body.notes ?? null, openingBalance: newOpening, balance: num(prior?.balance) + (newOpening - oldOpening), __pending: true };
    return { self: { kind: "update", resource: "clients", matchId: trimmed(body.oldName), matchOn: "clientName", patch: row }, cross: [], response: { status: 200, body: row } };
  }
  if (m === "DELETE" && /^\/api\/statement\/clients\/([^/]+)$/.test(path)) {
    // The delete endpoint's :id is the manual client-account id, so the
    // self-patch must match cached rows by their `manualId`, not `id`.
    const id = path.match(/^\/api\/statement\/clients\/([^/]+)$/)![1];
    return { self: { kind: "delete", resource: "clients", matchId: id, matchOn: "manualId" }, cross: [], response: { status: 200, body: { message: "Deleted" } } };
  }

  // ---- Vouchers ----
  if (m === "POST" && /^\/api\/vouchers$/.test(path)) {
    const amount = num(body.amount);
    const isReceipt = body.kind === "receipt";
    const cross: CrossPatch[] = [];
    if (body.partyType === "agent") {
      cross.push({ resource: "agents", matchField: "name", matchValue: trimmed(body.partyName), add: isReceipt ? { paidFrom: amount, balance: -amount } : { paidTo: amount, balance: amount } });
    } else if (body.partyType === "client") {
      cross.push({ resource: "clients", matchField: "clientName", matchValue: trimmed(body.partyName), add: isReceipt ? { voucherReceipts: amount, balance: -amount } : { voucherPayments: amount, balance: amount } });
    }
    const row = { ...body, id: tempId, amount, voucherDate: body.voucherDate ?? nowIso, createdAt: nowIso, clientRequestId: tempId, __pending: true };
    return { self: { kind: "create", resource: "vouchers", tempId, row }, cross, response: { status: 201, body: row } };
  }
  if ((m === "PUT" || m === "DELETE") && /^\/api\/vouchers\/([^/]+)$/.test(path)) {
    const id = path.match(/^\/api\/vouchers\/([^/]+)$/)![1];
    const cross: CrossPatch[] = [];
    if (prior) {
      const oldAmount = num(prior.amount);
      const oldIsReceipt = prior.kind === "receipt";
      if (prior.partyType === "agent") cross.push({ resource: "agents", matchField: "name", matchValue: trimmed(prior.partyName), add: oldIsReceipt ? { paidFrom: -oldAmount, balance: oldAmount } : { paidTo: -oldAmount, balance: -oldAmount } });
      else if (prior.partyType === "client") cross.push({ resource: "clients", matchField: "clientName", matchValue: trimmed(prior.partyName), add: oldIsReceipt ? { voucherReceipts: -oldAmount, balance: oldAmount } : { voucherPayments: -oldAmount, balance: -oldAmount } });
    }
    if (m === "DELETE") return { self: { kind: "delete", resource: "vouchers", matchId: id }, cross, response: { status: 200, body: { message: "Deleted" } } };
    const amount = num(body.amount);
    const isReceipt = body.kind === "receipt";
    if (body.partyType === "agent") cross.push({ resource: "agents", matchField: "name", matchValue: trimmed(body.partyName), add: isReceipt ? { paidFrom: amount, balance: -amount } : { paidTo: amount, balance: amount } });
    else if (body.partyType === "client") cross.push({ resource: "clients", matchField: "clientName", matchValue: trimmed(body.partyName), add: isReceipt ? { voucherReceipts: amount, balance: -amount } : { voucherPayments: amount, balance: amount } });
    const row = { ...prior, ...body, id, amount, __pending: true };
    return { self: { kind: "update", resource: "vouchers", matchId: id, patch: row }, cross, response: { status: 200, body: row } };
  }

  // ---- General ledger (income/expense) ----
  if (m === "POST" && /^\/api\/statement\/ledger$/.test(path)) {
    const row = { id: tempId, type: body.type, amount: num(body.amount), description: body.description, entryDate: body.entryDate ?? nowIso, createdAt: nowIso, clientRequestId: tempId, __pending: true };
    return { self: { kind: "create", resource: "ledger", tempId, row }, cross: [], response: { status: 201, body: row } };
  }
  if ((m === "PUT" || m === "DELETE") && /^\/api\/statement\/ledger\/([^/]+)$/.test(path)) {
    const id = path.match(/^\/api\/statement\/ledger\/([^/]+)$/)![1];
    if (m === "DELETE") return { self: { kind: "delete", resource: "ledger", matchId: id }, cross: [], response: { status: 200, body: { message: "Deleted" } } };
    const row = { ...prior, id, type: body.type, amount: num(body.amount), description: body.description, entryDate: body.entryDate ?? prior?.entryDate, __pending: true };
    return { self: { kind: "update", resource: "ledger", matchId: id, patch: row }, cross: [], response: { status: 200, body: row } };
  }

  // ---- Opening balances ----
  if (m === "POST" && /^\/api\/statement\/opening$/.test(path)) {
    const amount = num(body.amount);
    const resource = body.partyType === "agent" ? "agents" : "clients";
    const matchField = body.partyType === "agent" ? "name" : "clientName";
    const oldOpening = num(prior?.openingBalance);
    const cross: CrossPatch[] = [{ resource, matchField, matchValue: trimmed(body.name), add: { balance: amount - oldOpening } }];
    // openingBalance itself is a "set" — represented as an add of the exact delta plus we let the cross-patch consumer also set the field directly via a special key.
    return {
      self: { kind: "update", resource: `${resource}OpeningMarker`, matchId: "noop", patch: {} },
      cross: [{ ...cross[0], add: { ...cross[0].add, openingBalance: amount - oldOpening } }],
      response: { status: 200, body: { partyType: body.partyType, name: body.name, amount } },
    };
  }

  return null;
}
