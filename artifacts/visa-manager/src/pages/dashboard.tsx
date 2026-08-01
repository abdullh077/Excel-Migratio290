import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Users, FileText, Wallet, AlertTriangle, Bell } from "lucide-react";

const nf = new Intl.NumberFormat("ar-EG");
function om(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return nf.format(0);
  return nf.format(n);
}
function nt(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return nf.format(0);
  return nf.format(n);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => fetchJson("/api/dashboard/stats"),
  });
  const monthlyQuery = useQuery({
    queryKey: ["/api/dashboard/monthly"],
    queryFn: () => fetchJson("/api/dashboard/monthly"),
  });
  const agentsQuery = useQuery({
    queryKey: ["/api/dashboard/agents"],
    queryFn: () => fetchJson("/api/dashboard/agents"),
  });
  const outstandingQuery = useQuery({
    queryKey: ["/api/dashboard/outstanding"],
    queryFn: () => fetchJson("/api/dashboard/outstanding"),
  });

  const isLoading =
    statsQuery.isLoading ||
    monthlyQuery.isLoading ||
    agentsQuery.isLoading ||
    outstandingQuery.isLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 sm:p-6 md:p-8 space-y-8 animate-pulse">
          <div className="h-8 w-1/4 rounded-lg bg-muted" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-32 rounded-xl bg-muted" />
          </div>
          <div className="h-96 rounded-xl bg-muted" />
        </div>
      </AppLayout>
    );
  }

  const stats = statsQuery.data ?? {};
  const monthly = monthlyQuery.data;
  const agents = agentsQuery.data;
  const outstanding = outstandingQuery.data;

  const chartData = Array.isArray(monthly)
    ? monthly.map((m: any) => ({
        name: `${m.month}/${m.year}`,
        "عمرة (عدد)": m.umrahCount,
        "أخرى (عدد)": m.visasCount,
        "ربح العمرة": m.umrahProfit,
        "ربح الأخرى": m.visasProfit,
      }))
    : [];

  const agentRows = Array.isArray(agents) ? agents : [];
  const outstandingRows = Array.isArray(outstanding) ? outstanding : [];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Hero */}
        <div className="oboor-hero rounded-2xl px-6 py-7 md:px-8 md:py-8 text-white shadow-lg">
          <div className="inline-flex items-center gap-2 mb-3 rounded-full bg-white/10 px-3 py-1 text-xs">
            <span className="text-[hsl(40,66%,60%)]">●</span>
            <span>نظام عبور الذكي</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">لوحة القيادة</h1>
          <p className="mt-2 text-sm md:text-base text-white/80">
            نظرة عامة على أداء المكتب والإحصائيات المالية.
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="oboor-hero relative overflow-hidden rounded-xl text-white shadow-md p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[hsl(43,65%,52%)] to-[hsl(43,85%,65%)]" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/70">إجمالي عملاء العمرة</p>
                <p className="mt-2 text-3xl font-bold" dir="ltr">{om(stats.umrahTotal)}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-white/70">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    داخل: {om(stats.umrahInsideKsa)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                    خارج: {om(stats.umrahOutsideKsa)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-primary via-primary to-accent p-3.5 text-white shadow-md ring-2 ring-accent/30">
                <Users className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="oboor-hero relative overflow-hidden rounded-xl text-white shadow-md p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[hsl(43,85%,65%)] to-[hsl(43,65%,52%)]" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/70">إجمالي التأشيرات الأخرى</p>
                <p className="mt-2 text-3xl font-bold" dir="ltr">{om(stats.visasTotal)}</p>
                <p className="mt-3 text-xs text-white/70">التأشيرات غير العمرة</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent via-accent to-primary p-3.5 text-white shadow-md ring-2 ring-primary/20">
                <FileText className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="oboor-hero relative overflow-hidden rounded-xl text-white shadow-md p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-green-500 to-emerald-400" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/70">إجمالي الأرباح</p>
                <p className="mt-2 text-3xl font-bold text-emerald-300" dir="ltr">{om(stats.totalProfit)}</p>
                <p className="mt-3 text-xs text-white/70">
                  العمرة: {om(stats.umrahTotalProfit)} | أخرى: {om(stats.visasTotalProfit)}
                </p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-primary to-accent p-3.5 text-white shadow-md ring-2 ring-accent/30">
                <Wallet className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="oboor-hero relative overflow-hidden rounded-xl text-white shadow-md p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-amber-500 to-yellow-400" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/70">مبالغ مستحقة (تأشيرات)</p>
                <p className="mt-2 text-3xl font-bold text-amber-300" dir="ltr">{om(stats.visasTotalClientBalance)}</p>
                <p className="mt-3 text-xs text-white/70">
                  بواقي على الوكلاء: {om(stats.visasTotalAgentBalance)}
                </p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-accent to-primary p-3.5 text-white shadow-md ring-2 ring-primary/20">
                <AlertTriangle className="w-7 h-7" />
              </div>
            </div>
          </div>
        </div>

        {/* Chart + Outstanding */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart card */}
          <div className="col-span-1 lg:col-span-2 rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="p-6 pb-2">
              <h2 className="text-lg font-semibold">الأداء الشهري</h2>
              <p className="text-sm text-muted-foreground">عدد التأشيرات المصدرة حسب الشهر</p>
            </div>
            <div className="p-6 pt-2" dir="ltr">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barUmrah" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="barOther" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.65} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
                  />
                  <Bar dataKey="عمرة (عدد)" fill="url(#barUmrah)" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {chartData.map((_, i) => (
                      <Cell key={`u-${i}`} />
                    ))}
                  </Bar>
                  <Bar dataKey="أخرى (عدد)" fill="url(#barOther)" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {chartData.map((_, i) => (
                      <Cell key={`o-${i}`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Outstanding card */}
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-card text-card-foreground shadow-sm">
            <div className="p-6 pb-4 bg-red-50/50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/50 rounded-t-xl">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Bell className="w-5 h-5 text-red-600" />
                تنبيهات البواقي
              </h2>
              <p className="text-sm text-muted-foreground">عملاء عليهم مستحقات مالية (أكثر من 0)</p>
            </div>
            <div className="max-h-[350px] overflow-y-auto">
              {outstandingRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <Bell className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">لا يوجد عملاء عليهم مستحقات مالية.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="px-4 py-2 text-right font-medium">العميل</th>
                      <th className="px-4 py-2 text-left font-medium">الباقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingRows.map((o: any, i: number) => (
                      <tr key={o.id ?? i} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          <div className="font-medium text-sm">{o.clientName}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">{o.phone}</div>
                        </td>
                        <td className="px-4 py-2 text-left font-bold text-red-600" dir="ltr">
                          {nt(o.clientBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Agents */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 pb-2">
            <h2 className="text-lg font-semibold">أداء الوكلاء</h2>
            <p className="text-sm text-muted-foreground">إحصائيات المبيعات والأرباح حسب الوكيل</p>
          </div>
          <div className="p-6 pt-2 overflow-x-auto">
            {agentRows.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">لا توجد بيانات متاحة للوكلاء</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="px-4 py-3 text-right font-medium">الوكيل</th>
                    <th className="px-4 py-3 text-center font-medium">عمرة (عدد)</th>
                    <th className="px-4 py-3 text-center font-medium">تأشيرات أخرى (عدد)</th>
                    <th className="px-4 py-3 text-left font-medium">إجمالي الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map((a: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{a.agent || "بدون وكيل"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono">
                          {om(a.umrahCount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono">
                          {om(a.visasCount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left font-bold text-green-600" dir="ltr">
                        {om(a.totalProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
