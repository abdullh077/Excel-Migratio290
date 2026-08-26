// Drop-in replacement for `fetch()` used across the daily-work pages
// (Umrah, Other visas, Statement). Same signature and return shape
// (a Response), so existing call sites only need `fetch(` swapped for
// `offlineFetch(`.
//
// GET: serves the network response when reachable (caching it for later);
// falls back to the last cached copy when the network is unreachable.
// Both paths return the same URL's cached copy with any pending outbox
// changes overlaid, so the UI never has to know which case happened.
//
// Writes (POST/PUT/DELETE): sent to the network first. A genuine
// validation/conflict error from the server (any non-network response) is
// returned as-is — offline mode never hides a real error. Only a network
// failure queues the write in the outbox and returns a synthesized
// optimistic response so the calling page's existing success handling
// (toast, refetch, close dialog, etc.) keeps working unmodified.

import { readCache, writeCache, applySelfOp, applyCrossPatches } from "./cache";
import { enqueue, refreshPendingCount } from "./outbox";
import { planMutation } from "./affects";
import { getCurrentOfficeId } from "./authCache";

function isNetworkError(err: unknown): boolean {
  // fetch() throws TypeError for network failures (offline, DNS, CORS-blocked, etc.)
  return err instanceof TypeError || (err instanceof Error && /network|failed to fetch|load failed/i.test(err.message));
}

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function offlineFetch(input: string, init?: RequestInit, hint?: { priorRow?: any }): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const officeId = getCurrentOfficeId();

  if (method === "GET") {
    try {
      const res = await fetch(input, { credentials: "include", ...init });
      if (res.ok && officeId) {
        const json = await res.clone().json().catch(() => undefined);
        if (json !== undefined) await writeCache(officeId, input, json);
      }
      return res;
    } catch (err) {
      if (!isNetworkError(err) || !officeId) throw err;
      const cached = await readCache(officeId, input);
      if (cached === undefined) throw err;
      return jsonResponse(200, cached);
    }
  }

  // Writes
  try {
    const res = await fetch(input, { credentials: "include", ...init });
    return res;
  } catch (err) {
    if (!isNetworkError(err) || !officeId) throw err;

    let body: any = {};
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = {};
      }
    }

    const tempId = `offline-${crypto.randomUUID()}`;
    const plan = planMutation(method, input, body, tempId, hint);
    if (!plan) {
      // No known plan for this endpoint — never silently pretend success for
      // an operation we don't understand.
      throw err;
    }

    if (plan.self.kind === "create") {
      body = { ...body, clientRequestId: tempId };
    }

    await enqueue({
      id: tempId,
      officeId,
      method,
      url: input,
      body,
      label: describeOp(method, input),
      tempId: plan.self.kind === "create" ? tempId : undefined,
      cross: plan.cross,
      selfResource: plan.self.resource,
    });

    await applySelfOp(plan.self, officeId);
    await applyCrossPatches(plan.cross, officeId);
    await refreshPendingCount();

    return jsonResponse(plan.response.status, plan.response.body);
  }
}

function describeOp(method: string, path: string): string {
  const labels: Record<string, string> = {
    "/api/umrah": "بيانات تأشيرة عمرة",
    "/api/visas": "بيانات تأشيرة",
    "/api/statement/agents": "بيانات وكيل",
    "/api/statement/clients": "بيانات عميل",
    "/api/vouchers": "سند قبض/صرف",
    "/api/statement/ledger": "قيد دخل/مصروف",
    "/api/statement/opening": "رصيد افتتاحي",
  };
  const base = Object.keys(labels).find((k) => path.startsWith(k));
  const verb = method === "POST" ? "إضافة" : method === "DELETE" ? "حذف" : "تعديل";
  return `${verb} ${base ? labels[base] : "عملية"}`;
}
