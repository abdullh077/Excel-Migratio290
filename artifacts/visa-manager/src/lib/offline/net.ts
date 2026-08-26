// Connectivity + sync status: a tiny external store any component can
// subscribe to (via useSyncExternalStore) without prop drilling.

export interface SyncStatus {
  online: boolean;
  pendingCount: number;
  lastSyncAt: string | null; // ISO timestamp of the last successful full sync
  syncing: boolean;
  failedOps: Array<{ id: string; label: string; error: string }>;
}

type Listener = () => void;

let status: SyncStatus = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingCount: 0,
  lastSyncAt: null,
  syncing: false,
  failedOps: [],
};

const listeners = new Set<Listener>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function patchSyncStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => patchSyncStatus({ online: true }));
  window.addEventListener("offline", () => patchSyncStatus({ online: false }));
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
