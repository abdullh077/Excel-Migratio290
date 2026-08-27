// Persistent, non-blocking connectivity indicator. Shows online/offline,
// how many writes are queued for the next sync, when the last sync
// succeeded, and a clear (dismissible) alert for any write that failed
// permanently (a real validation error, not just "no network").
import { useSyncExternalStore, useState } from "react";
import { WifiOff, Wifi, RefreshCw, AlertTriangle, X, RotateCcw } from "lucide-react";
import { getSyncStatus, subscribeSyncStatus } from "@/lib/offline/net";
import { retryOutboxRecord } from "@/lib/offline/outbox";

function timeAgo(iso: string | null): string {
  if (!iso) return "لم تتم المزامنة بعد";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory");
}

export function OfflineStatusBar() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [dismissedFailures, setDismissedFailures] = useState<Set<string>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const visibleFailures = status.failedOps.filter((f) => !dismissedFailures.has(f.id));

  async function handleRetry(id: string) {
    setRetryingIds((prev) => new Set([...prev, id]));
    try {
      await retryOutboxRecord(id);
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 flex flex-col gap-2 no-print" dir="rtl">
      {visibleFailures.length > 0 && (
        <div className="max-w-sm rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs shadow-lg backdrop-blur">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-destructive mb-1">
                تعذّرت مزامنة {visibleFailures.length} عملية
              </p>
              <ul className="space-y-1.5 text-muted-foreground max-h-56 overflow-y-auto pl-1">
                {visibleFailures.map((f) => {
                  const isRetrying = retryingIds.has(f.id);
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <span className="truncate" title={`${f.label}: ${f.error}`}>
                        {f.label}: {f.error}
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <button
                          aria-label="إعادة المحاولة"
                          disabled={isRetrying}
                          onClick={() => handleRetry(f.id)}
                          className="flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50"
                        >
                          <RotateCcw className={"w-3 h-3" + (isRetrying ? " animate-spin" : "")} />
                          إعادة المحاولة
                        </button>
                        <button
                          aria-label="إخفاء هذه العملية"
                          onClick={() => setDismissedFailures(new Set([...dismissedFailures, f.id]))}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <button
              aria-label="إخفاء الكل"
              title="إخفاء الكل"
              onClick={() => setDismissedFailures(new Set([...dismissedFailures, ...visibleFailures.map((f) => f.id)]))}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 text-xs shadow-md backdrop-blur">
        {status.online ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-destructive" />
        )}
        <span className={status.online ? "text-emerald-700" : "text-destructive"}>
          {status.online ? "متصل" : "غير متصل"}
        </span>
        {status.pendingCount > 0 && (
          <span className="flex items-center gap-1 text-amber-700 border-r pr-2 mr-1">
            <RefreshCw className={"w-3 h-3" + (status.syncing ? " animate-spin" : "")} />
            {status.pendingCount} بانتظار المزامنة
          </span>
        )}
        <span className="text-muted-foreground border-r pr-2 mr-1">
          آخر مزامنة: {timeAgo(status.lastSyncAt)}
        </span>
      </div>
    </div>
  );
}

export default OfflineStatusBar;
