// Server-response cache (IndexedDB-backed "read-through" mirror) plus the
// optimistic patchers that keep it correct while writes are queued offline.
//
// Every successful GET response is stored verbatim, keyed by the exact URL
// it was fetched from. When offline, the same URL is served back from here.
// Pending outbox writes are layered on top so lists/balances reflect
// not-yet-synced changes immediately (see affects.ts for the exact formulas).

import { idbGet, idbGetAll, idbPut, STORE_CACHE } from "./idb";
import type { CrossPatch, SelfOp } from "./affects";

interface CacheEntry {
  key: string;
  json: any;
  updatedAt: string;
}

function cacheKey(officeId: number, url: string): string {
  return `${officeId}:${url}`;
}

export async function readCache(officeId: number, url: string): Promise<any | undefined> {
  const entry = await idbGet<CacheEntry>(STORE_CACHE, cacheKey(officeId, url));
  return entry?.json;
}

export async function writeCache(officeId: number, url: string, json: any): Promise<void> {
  await idbPut(STORE_CACHE, { key: cacheKey(officeId, url), json, updatedAt: new Date().toISOString() } satisfies CacheEntry);
}

const RESOURCE_PREFIX: Record<string, string> = {
  umrah: "/api/umrah",
  visas: "/api/visas",
  agents: "/api/statement/agents",
  clients: "/api/statement/clients",
  vouchers: "/api/vouchers",
  ledger: "/api/statement/ledger",
};

async function entriesForPrefix(officeId: number, prefix: string): Promise<CacheEntry[]> {
  const all = await idbGetAll<CacheEntry>(STORE_CACHE);
  const marker = `${officeId}:${prefix}`;
  return all.filter((e) => e.key.startsWith(marker));
}

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Applies a create/update/delete directly to the entity's own cached list(s). */
export async function applySelfOp(op: SelfOp, officeId: number): Promise<void> {
  if (op.resource.endsWith("OpeningMarker")) return; // opening balance is expressed purely as a cross-patch

  // Agent-payment / voucher sub-lists nested in an agent detail response.
  const paymentsMatch = op.resource.match(/^agentPayments:(.+)$/);
  if (paymentsMatch) {
    const agentId = paymentsMatch[1];
    const entries = await entriesForPrefix(officeId, `/api/statement/agents/${agentId}`);
    for (const e of entries) {
      if (!e.json || Array.isArray(e.json) || !Array.isArray(e.json.payments)) continue;
      if (op.kind === "create") e.json.payments = [op.row, ...e.json.payments];
      else if (op.kind === "delete") e.json.payments = e.json.payments.filter((p: any) => String(p.id) !== String(op.matchId));
      await writeCache(officeId, e.key.slice(`${officeId}:`.length), e.json);
    }
    return;
  }

  const prefix = RESOURCE_PREFIX[op.resource];
  if (!prefix) return;
  const matchOn = op.kind !== "create" ? op.matchOn ?? "id" : "id";
  const matchesRow = (row: any): boolean => {
    const field = matchOn === "clientName" ? row.clientName : matchOn === "manualId" ? row.manualId : row.id;
    return field != null && String(field).trim() === String(op.kind !== "create" ? op.matchId : "").trim();
  };
  const entries = await entriesForPrefix(officeId, prefix);
  for (const e of entries) {
    if (!Array.isArray(e.json)) continue; // only flat list caches are self-patched; detail views heal on next real fetch
    if (op.kind === "create") e.json = [op.row, ...e.json];
    else if (op.kind === "update") e.json = e.json.map((row: any) => (matchesRow(row) ? { ...row, ...op.patch } : row));
    else if (op.kind === "delete") e.json = e.json.filter((row: any) => !matchesRow(row));
    await writeCache(officeId, e.key.slice(`${officeId}:`.length), e.json);
  }
}

function applyAddTo(target: any, add: Record<string, number>): void {
  for (const [k, v] of Object.entries(add)) {
    if (k in target) target[k] = num(target[k]) + v;
  }
}

/** Applies balance/total deltas to whichever cached agent/client rows are affected. */
export async function applyCrossPatches(cross: CrossPatch[], officeId?: number): Promise<void> {
  if (!officeId) return;
  for (const patch of cross) {
    const name = patch.matchValue?.trim();
    if (!name) continue;
    const prefix = RESOURCE_PREFIX[patch.resource];
    const entries = await entriesForPrefix(officeId, prefix);
    for (const e of entries) {
      let changed = false;
      if (Array.isArray(e.json)) {
        for (const row of e.json) {
          const rowName = patch.resource === "agents" ? row.name : row.clientName;
          if (typeof rowName === "string" && rowName.trim() === name) {
            if (patch.add) applyAddTo(row, patch.add);
            changed = true;
          }
        }
      } else if (e.json && typeof e.json === "object") {
        // Detail shapes: agent detail has `.agent` + `.totals`; client detail has `.account`.
        if (patch.resource === "agents" && e.json.agent?.name?.trim() === name) {
          if (patch.add) {
            applyAddTo(e.json.agent, patch.add);
            if (e.json.totals) applyAddTo(e.json.totals, patch.add);
          }
          changed = true;
        }
        if (patch.resource === "clients" && e.json.account?.clientName?.trim() === name) {
          if (patch.add) applyAddTo(e.json.account, patch.add);
          changed = true;
        }
      }
      if (changed) await writeCache(officeId, e.key.slice(`${officeId}:`.length), e.json);
    }
  }
}

export async function removeSelfRow(_resource: string, _matchId: string | number): Promise<void> {
  // Reserved for future use (currently handled inline by applySelfOp's delete branch).
}
