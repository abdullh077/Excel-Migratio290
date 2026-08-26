// Gate for the pages that stay online-required in this phase (Dashboard,
// Archive, Provider management, Backup/Restore inside Office). Shows a
// local, non-blocking message instead of the old app-wide OfflineGate —
// the rest of the app keeps working normally while this is shown.
import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { getSyncStatus, subscribeSyncStatus } from "@/lib/offline/net";

export function RequireOnline({ children }: { children: React.ReactNode }) {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);

  if (status.online) return <>{children}</>;

  return (
    <div dir="rtl" className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <WifiOff className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h1 className="text-lg font-bold mb-2">يتطلب اتصالاً بالإنترنت</h1>
        <p className="text-sm text-muted-foreground">
          هذه الصفحة تحتاج اتصالاً بالإنترنت. صفحات تأشيرات العمرة والتأشيرات
          الأخرى وكشف الحساب تبقى تعمل بدون اتصال.
        </p>
      </div>
    </div>
  );
}

export default RequireOnline;
