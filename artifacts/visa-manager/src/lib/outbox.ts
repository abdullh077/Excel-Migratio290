// Offline outbox: queues umrah/visa mutations in localStorage and flushes them
// when connectivity returns. Mirrors production behaviour (oboor-outbox-v1).

const OUTBOX_KEY = "oboor-outbox-v1";

export type OutboxKind = "umrah" | "visa";

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  payload: Record<string, any>;
  label: string;
  queuedAt: string;
}

export interface FlushFailure {
  label: string;
  error: string;
}

export interface FlushResult {
  uploaded: number;
  failed: FlushFailure[];
}

const subscribers = new Set<() => void>();

function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // ignore quota/serialization errors
  }
  notify();
}

function notify(): void {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function outboxCount(): number {
  return readOutbox().length;
}

export function enqueue(
  kind: OutboxKind,
  payload: Record<string, any>,
  label: string,
): OutboxItem {
  const item: OutboxItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    label,
    queuedAt: new Date().toISOString(),
  };
  const items = readOutbox();
  items.push(item);
  writeOutbox(items);
  return item;
}

let flushing = false;

export async function flush(): Promise<FlushResult> {
  if (flushing) return { uploaded: 0, failed: [] };
  flushing = true;

  const failed: FlushFailure[] = [];
  let uploaded = 0;

  try {
    const snapshot = [...readOutbox()];
    for (const item of snapshot) {
      const endpoint = item.kind === "umrah" ? "/api/umrah" : "/api/visas";
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item.payload, clientRequestId: item.id }),
        });
      } catch {
        // Network error — stop, retain this and remaining items.
        break;
      }

      const current = readOutbox();

      if (res.ok) {
        uploaded += 1;
        writeOutbox(current.filter((i) => i.id !== item.id));
        continue;
      }

      // 4xx (except 401/429) => permanent failure; drop item and record error.
      if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
        let data: any = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        failed.push({ label: item.label, error: data?.error || `خطأ ${res.status}` });
        writeOutbox(current.filter((i) => i.id !== item.id));
        continue;
      }

      // 5xx, 401, 429, or other non-ok => retain for later retry, stop.
      break;
    }
  } finally {
    flushing = false;
    notify();
  }

  return { uploaded, failed };
}

// Auto-flush when the browser regains connectivity.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flush();
  });
}
