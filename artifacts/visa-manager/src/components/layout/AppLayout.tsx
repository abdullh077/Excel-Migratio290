import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { LogOut, LayoutDashboard, Users, FileText, Archive, BookOpen, Receipt, Settings, UserCog, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { href: "/", label: "لوحة المؤشرات", icon: LayoutDashboard, roles: ["provider", "owner", "sub"] },
  { href: "/umrah", label: "معتمرو العمرة", icon: Users, roles: ["provider", "owner", "sub"] },
  { href: "/visas", label: "التأشيرات الأخرى", icon: FileText, roles: ["provider", "owner", "sub"] },
  { href: "/archive", label: "الأرشيف العام", icon: Archive, roles: ["provider", "owner", "sub"] },
  { href: "/statement", label: "كشف الحساب", icon: BookOpen, roles: ["provider", "owner"] },
  { href: "/vouchers", label: "السندات", icon: Receipt, roles: ["provider", "owner"] },
  { href: "/office", label: "إعدادات المكتب", icon: Settings, roles: ["provider", "owner", "sub"] },
  { href: "/provider", label: "إدارة الحسابات", icon: UserCog, roles: ["provider"] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        localStorage.removeItem("oboor-query-cache-v1");
        window.location.href = "/login";
      },
    },
  });

  const role = user?.role ?? "sub";
  const visibleNav = navItems.filter((n) => n.roles.includes(role));

  return (
    <div dir="rtl" className="flex h-screen overflow-hidden bg-background font-sans">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-l border-sidebar-border">
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="عبور" className="w-8 h-8" onError={(e) => (e.currentTarget.style.display = "none")} />
            <div>
              <div className="font-bold text-sm text-accent leading-tight">نظام عبور الذكي</div>
              <div className="text-xs text-sidebar-foreground/60 leading-tight">إدارة التأشيرات</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNav.map((item) => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight className="w-3 h-3 opacity-60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/60 mb-2 px-1">
            {user?.username && <span className="font-medium text-sidebar-foreground/80">{user.username}</span>}
            {role === "provider" && <span className="mr-1 text-accent">(مزود)</span>}
            {role === "owner" && <span className="mr-1 text-accent">(مكتب)</span>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout.mutate(undefined)}
          >
            <LogOut className="w-4 h-4 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
