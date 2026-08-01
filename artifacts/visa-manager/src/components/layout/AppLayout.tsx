import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  LogOut,
  LayoutDashboard,
  Users,
  FileText,
  Archive,
  Building2,
  Wallet,
  UserCog,
  Menu,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@/hooks/useAuth";
import { apiRequest, clearClientCaches } from "@/lib/api";
import { subscribe as outboxSubscribe, outboxCount, flush } from "@/lib/outbox";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function buildNav(role: string | undefined): NavItem[] {
  const base: NavItem[] = [
    { href: "/", label: "لوحة القيادة", icon: LayoutDashboard },
    { href: "/umrah", label: "عملاء العمرة", icon: Users },
    { href: "/visas", label: "تأشيرات أخرى", icon: FileText },
    { href: "/archive", label: "الأرشيف العام", icon: Archive },
  ];
  if (role === "owner" || role === "provider") {
    base.push({ href: "/office", label: "بيانات المكتب", icon: Building2 });
    base.push({ href: "/statement", label: "كشف الحساب", icon: Wallet });
  }
  if (role === "provider") {
    base.push({ href: "/provider", label: "إدارة المزوّد", icon: UserCog });
  }
  return base;
}

function roleLabel(role: string | undefined): string {
  if (role === "provider") return "المزوّد";
  if (role === "owner") return "الحساب الرئيسي";
  return "حساب فرعي";
}

// --------------------------------------------------------------------------
// Offline / outbox banner
// --------------------------------------------------------------------------
function useOutboxCount(): number {
  return useSyncExternalStore(
    (cb) => outboxSubscribe(cb),
    () => outboxCount(),
    () => 0,
  );
}

function OfflineBanner() {
  const { toast } = useToast();
  const count = useOutboxCount();
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [uploading, setUploading] = useState(false);

  const runFlush = async () => {
    setUploading(true);
    try {
      const { uploaded, failed } = await flush();
      if (uploaded > 0) {
        toast({ description: `تم رفع ${uploaded} معاملة معلّقة بنجاح` });
      }
      failed.forEach((f) => {
        toast({
          variant: "destructive",
          title: `تعذر رفع: ${f.label}`,
          description: f.error,
        });
      });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void runFlush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Attempt an immediate flush on mount.
    void runFlush();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online && count === 0) return null;

  if (!online) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-sm bg-destructive/10 text-destructive border-b border-destructive/20">
        <span>
          لا يوجد اتصال بالإنترنت — يمكنك متابعة العمل، وستُرفع المعاملات الجديدة
          تلقائياً عند عودة الاتصال.
          {count > 0 ? ` (${count} بانتظار الرفع)` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-50 text-amber-900 border-b border-amber-200">
      {uploading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جارٍ رفع المعاملات المعلّقة...</span>
        </>
      ) : (
        <span>{count} معاملة بانتظار الرفع</span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 mr-auto"
        onClick={() => void runFlush()}
        disabled={uploading}
      >
        <RefreshCw className="w-3.5 h-3.5 ml-1" />
        رفع الآن
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Sidebar
// --------------------------------------------------------------------------
function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const role = user?.role;
  const nav = buildNav(role);

  const logout = useMutation({
    mutationFn: async () => {
      // Save a local copy of the office data on every exit (owner only),
      // BEFORE the session ends.
      if (role === "owner") {
        try { await downloadOfficeBackup(); } catch { /* offline — skip */ }
      }
      return apiRequest("/api/auth/logout", { method: "POST" });
    },
    onSuccess: async () => {
      await clearClientCaches();
      queryClient.clear();
      onClose();
      setLocation("/login");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "حدث خطأ أثناء تسجيل الخروج",
      });
    },
  });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed md:static inset-y-0 right-0 z-50 w-64 bg-sidebar border-l border-sidebar-border flex flex-col h-full no-print transform transition-transform duration-300 md:transform-none",
          open ? "translate-x-0" : "translate-x-full",
          "md:translate-x-0",
        )}
      >
        {/* Header */}
        <div className="h-16 px-6 flex items-center border-b border-sidebar-border">
          <LayoutDashboard className="w-6 h-6 text-sidebar-primary ml-3" />
          <span className="font-bold text-sidebar-foreground">
            نظام عبور الذكي
          </span>
          <button
            aria-label="إغلاق"
            className="md:hidden mr-auto text-sidebar-foreground/70"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map((item) => {
            const active =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={onClose}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      active && "text-sidebar-primary",
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-3 px-1">
            <div className="text-sm font-medium text-sidebar-foreground">
              {user?.username}
            </div>
            <div className="text-xs text-sidebar-foreground/60">
              {roleLabel(role)}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:bg-destructive/10 border-destructive/20 hover:text-destructive"
            onClick={() => logout.mutate()}
          >
            <LogOut className="w-4 h-4 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>
    </>
  );
}

// --------------------------------------------------------------------------
// Shell
// --------------------------------------------------------------------------
// Download the office's backup file to this device.
export async function downloadOfficeBackup(): Promise<void> {
  const res = await fetch("/api/office/backup", { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `office-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Automatic daily local copy of the office's data: once per calendar day,
// silently download the office backup file to this device.
function useDailyLocalBackup() {
  const { data: user } = useGetMe();
  useEffect(() => {
    if (user?.role !== "owner") return;
    const today = new Date().toISOString().slice(0, 10);
    const key = "oboor-office-backup-date";
    if (localStorage.getItem(key) === today) return;
    downloadOfficeBackup()
      .then(() => localStorage.setItem(key, today))
      .catch(() => { /* offline or server unavailable — try again next load */ });
  }, [user?.role]);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useDailyLocalBackup();

  return (
    <div dir="rtl" className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <OfflineBanner />

        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-border bg-card">
          <button aria-label="القائمة" onClick={() => setOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold">نظام عبور الذكي</span>
        </div>

        <main className="flex-1 overflow-y-auto w-full oboor-canvas">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
