// Generalized write-queue (outbox): every mutation that fails to reach the
// server while offline is recorded here, then replayed in order once the
// connection returns. Creates carry a client-generated id sent as
// `clientRequestId` so a retried request can never create a duplicate row
// (mirrors the server-side onConflictDoNothing pattern already used for
// Umrah/visa creates — see artifacts/api-server/src/routes/umrah.ts).

import { idbGetAll, idbPut, idbDelete, STORE_OUTBOX } from "./idb";
import { patchSyncStatus } from "./net";
import { applyCrossPatches, removeSelfRow } from "./cache";
import { getCurrentOfficeId } from "./authCache";
import type { CrossPatch } from "./affects";

export interface OutboxRecord {
  seq?: number;
  id: string; // uuid, doubles as clientRequestId for creates
  officeId: number;
  method: string;
  url: string;
  body: any;
  label: string; // human description, e.g. "إضافة تأشيرة عمرة"
  tempId?: string; // set for create ops so later ops in the same session can reference the not-yet-real id
  cross: CrossPatch[];
  selfResource?: string;
  createdAt: string;
  attempts: number;
  status: "pending" | "failed";
  error?: string;
}

function substitute(value: string, remap: Map<string, string>): string {
  let out = value;
  for (const [temp, real] of remap) out = out.split(temp).join(real);
  return out;
}

export async function enqueue(record: Omit<OutboxRecord, "seq" | "attempts" | "status" | "createdAt">): Promise<void> {
  const full: OutboxRecord = { ...record, attempts: 0, status: "pending", createdAt: new Date().toISOString() };
  await idbPut(STORE_OUTBOX, full);
  await refreshPendingCount();
}

// Only ever surface/replay records belonging to the currently authenticated
// office. IndexedDB is shared per browser origin, so if a device is ever
// used to log into more than one office, another office's queued writes
// must stay invisible and untouched until THAT office is signed in again —
// otherwise they'd replay under the wrong office's session (cross-tenant
// data corruption). See offline-sync-architecture memory note.
async function currentOfficeRecords(): Promise<OutboxRecord[]> {
  const officeId = getCurrentOfficeId();
  if (officeId == null) return [];
  const all = await idbGetAll<OutboxRecord>(STORE_OUTBOX);
  return all.filter((r) => r.officeId === officeId);
}

export async function refreshPendingCount(): Promise<void> {
  const mine = await currentOfficeRecords();
  const pending = mine.filter((r) => r.status === "pending");
  const failed = mine.filter((r) => r.status === "failed");
  patchSyncStatus({
    pendingCount: pending.length,
    failedOps: failed.map((f) => ({ id: f.id, label: f.label, error: f.error || "فشل غير معروف" })),
  });
}

let flushing = false;

/** Replays queued writes against the real server, in order. Stops (leaving
 * the rest queued) at the first network failure so nothing is skipped.
 * Only replays records for the currently authenticated office — records
 * left behind by a different office that previously signed into this
 * device are never touched here. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  patchSyncStatus({ syncing: true });
  try {
    const remap = new Map<string, string>();
    let all = (await currentOfficeRecords()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

    for (const rec of all) {
      if (rec.status === "failed") {
        if (rec.tempId) remap.set(rec.tempId, `__failed__${rec.tempId}`);
        continue;
      }

      // Cascade-skip/fail if this op references a temp id whose create is
      // still pending earlier in the queue (rare — only when creating and
      // then immediately editing the same record before ever syncing).
      const serialized = rec.url + JSON.stringify(rec.body ?? {});
      const referencedTemp = all.find((o) => o.tempId && o.tempId !== rec.tempId && serialized.includes(o.tempId!) && !remap.has(o.tempId!));
      if (referencedTemp) {
        if (referencedTemp.status === "failed") {
          rec.status = "failed";
          rec.error = "تعتمد هذه العملية على عملية أخرى فشلت مزامنتها";
          await idbPut(STORE_OUTBOX, rec);
        }
        // else: dependency still pending ahead of us in a future pass — stop here for now.
        break;
      }

      const url = substitute(rec.url, remap);
      const body = rec.body ? JSON.parse(substitute(JSON.stringify(rec.body), remap)) : undefined;

      let res: Response;
      try {
        res = await fetch(url, {
          method: rec.method,
          credentials: "include",
          headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        // Network still down (or flaky) — stop, keep everything else queued.
        break;
      }

      if (res.ok) {
        if (rec.tempId) {
          try {
            const json = await res.clone().json();
            if (json?.id !== undefined) remap.set(rec.tempId, String(json.id));
          } catch {
            /* no json body */
          }
        }
        await idbDelete(STORE_OUTBOX, rec.seq!);
        continue;
      }

      if (res.status >= 500) {
        // Transient server error — stop and retry the whole batch later.
        break;
      }

      // Permanent (validation/conflict) failure — surface it, keep going with
      // independent ops, but any op depending on this one's tempId will
      // cascade-fail on a later pass.
      rec.attempts += 1;
      rec.status = "failed";
      try {
        const data = await res.json();
        rec.error = data?.error || `خطأ ${res.status}`;
      } catch {
        rec.error = `خطأ ${res.status}`;
      }
      await idbPut(STORE_OUTBOX, rec);
    }

    await refreshPendingCount();
    // Re-fetch fresh state for anything that just synced successfully; the
    // resource caches self-heal on the next normal GET, so nothing else to
    // do here besides recording the sync time when this office's queue is
    // fully drained (scoped — another office's leftover queue must never
    // affect this office's "last synced" status).
    const remaining = await currentOfficeRecords();
    if (!remaining.some((r) => r.status === "pending")) {
      patchSyncStatus({ lastSyncAt: new Date().toISOString() });
    }
  } finally {
    flushing = false;
    patchSyncStatus({ syncing: false });
  }
}

export function applyCross(cross: CrossPatch[]): Promise<void> {
  return applyCrossPatches(cross);
}

export { removeSelfRow };
