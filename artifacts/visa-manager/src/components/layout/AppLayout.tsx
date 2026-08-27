import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@/hooks/useAuth";
import { apiRequest, clearClientCaches } from "@/lib/api";
import { clearIdentity } from "@/lib/offline/authCache";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Fixed row height (px) shared by every nav item and the sliding active
// indicator so its translateY offset lines up exactly (see index.css
// .oboor-nav-indicator).
const NAV_ITEM_HEIGHT = 56;

function buildNav(role: string | undefined): NavItem[] {
  const base: NavItem[] = [
    { href: "/", label: "لوحة القيادة", icon: LayoutDashboard },
    { href: "/umrah", label: "تأشيرات العمرة", icon: Users },
    { href: "/visas", label: "تأشيرات أخرى", icon: FileText },
    { href: "/archive", label: "الأرشيف العام", icon: Archive },
    // كشف الحساب متاح لجميع مستخدمي المكتب (بما فيهم الحسابات الفرعية)
    { href: "/statement", label: "كشف الحساب", icon: Wallet },
  ];
  if (role === "owner" || role === "provider") {
    base.push({ href: "/office", label: "بيانات المكتب", icon: Building2 });
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
      await clearIdentity();
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
        <nav className="relative flex-1 overflow-y-auto py-3">
          {(() => {
            const activeIndex = nav.findIndex(
              (item) =>
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href)),
            );
            return activeIndex >= 0 ? (
              <div
                className="oboor-nav-indicator"
                style={{ transform: `translateY(${activeIndex * NAV_ITEM_HEIGHT}px)` }}
              />
            ) : null;
          })()}
          {nav.map((item) => {
            const active =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={onClose}>
                <div
                  className={cn(
                    "relative z-[1] flex items-center gap-3 pr-6 pl-3 text-sm cursor-pointer transition-colors duration-300",
                    active
                      ? "text-foreground font-semibold"
                      : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground",
                  )}
                  style={{ height: NAV_ITEM_HEIGHT }}
                >
                  <Icon
                    className={cn(
                      "w-[1.15rem] h-[1.15rem] flex-shrink-0 transition-transform duration-300",
                      active && "text-sidebar-primary scale-110",
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
