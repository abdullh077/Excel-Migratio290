// Minimal promise-based IndexedDB wrapper — no external dependency needed.
// One database for the whole app; object stores are described in store.ts.

const DB_NAME = "oboor-offline";
const DB_VERSION = 1;

export const STORE_CACHE = "cache"; // keyPath: key (string) — last-known server response per resource
export const STORE_OUTBOX = "outbox"; // autoIncrement seq — pending/failed local writes, in order
export const STORE_AUTH = "auth"; // keyPath: key (fixed "current") — cached identity/session snapshot
export const STORE_META = "meta"; // keyPath: key — small scalars (lastSyncAt, etc.)

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB غير متاح في هذا المتصفح"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: "seq", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_AUTH)) {
        db.createObjectStore(STORE_AUTH, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T = any>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return reqToPromise(tx.objectStore(store).get(key));
}

export async function idbGetAll<T = any>(store: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return reqToPromise(tx.objectStore(store).getAll());
}

export async function idbPut(store: string, value: any): Promise<IDBValidKey> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const res = await reqToPromise(tx.objectStore(store).put(value));
  return res;
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  await reqToPromise(tx.objectStore(store).delete(key));
}

export async function idbClear(store: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  await reqToPromise(tx.objectStore(store).clear());
}
