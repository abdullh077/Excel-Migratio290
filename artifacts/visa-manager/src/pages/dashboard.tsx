import { useGetDashboardStats, useGetMonthlyStats, useGetAgentStats, useGetOutstandingBalances } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fmt } from "@/lib/utils";
import { TrendingUp, Users, Plane, AlertCircle } from "lucide-react";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function DashboardPage() {
  const { data: stats } = useGetDashboardStats();
  const year = new Date().getFullYear();
  const { data: monthly } = useGetMonthlyStats({ year });
  const { data: agentStatsRaw } = useGetAgentStats();
  const { data: outstandingRaw } = useGetOutstandingBalances();
  const agentStats = Array.isArray(agentStatsRaw) ? agentStatsRaw : [];
  const outstanding = Array.isArray(outstandingRaw) ? outstandingRaw : [];

  const chartData = Array.isArray(monthly) ? monthly.map((m) => ({
    name: MONTHS_AR[m.month - 1],
    عمرة: m.umrahProfit,
    تأشيرات: m.visasProfit,
  })) : [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6" dir="rtl">
        <h1 className="text-xl font-bold text-foreground">لوحة المؤشرات</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="معتمرو العمرة" value={stats?.umrahTotal ?? 0} sub={`داخل المملكة: ${stats?.umrahInsideKsa ?? 0}`} icon={Users} color="text-blue-600" />
          <KpiCard title="التأشيرات الأخرى" value={stats?.visasTotal ?? 0} sub={`أرباح: ${fmt(stats?.visasTotalProfit)} ر.س`} icon={Plane} color="text-green-600" />
          <KpiCard title="إجمالي الأرباح" value={`${fmt(stats?.totalProfit)} ر.س`} sub={`عمرة: ${fmt(stats?.umrahTotalProfit)} ر.س`} icon={TrendingUp} color="text-accent" />
          <KpiCard title="مستحقات العملاء" value={`${fmt(stats?.visasTotalClientBalance)} ر.س`} sub={`مستحقات الوكلاء: ${fmt(stats?.visasTotalAgentBalance)} ر.س`} icon={AlertCircle} color="text-orange-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Chart */}
          <Card className="lg:col-span-2 p-4">
            <h2 className="text-sm font-semibold mb-4 text-foreground">الأداء الشهري {year}</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Tajawal" }} />
                <YAxis tick={{ fontSize: 11, fontFamily: "Tajawal" }} width={55} tickFormatter={(v) => fmt(v, 0)} />
                <Tooltip formatter={(v: number) => `${fmt(v)} ر.س`} labelStyle={{ fontFamily: "Tajawal" }} contentStyle={{ fontFamily: "Tajawal", direction: "rtl" }} />
                <Bar dataKey="عمرة" fill="hsl(220,40%,18%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="تأشيرات" fill="hsl(43,85%,58%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Outstanding */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3 text-foreground">أرصدة معلقة</h2>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {outstanding?.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد أرصدة معلقة</p>}
              {outstanding?.map((o) => (
                <div key={o.id} className="flex justify-between items-start text-xs border-b pb-2">
                  <div>
                    <div className="font-medium text-foreground">{o.clientName}</div>
                    <div className="text-muted-foreground" dir="ltr">{o.phone}</div>
                  </div>
                  <div className="text-left">
                    {o.clientBalance > 0 && <div className="text-orange-600">عميل: {fmt(o.clientBalance)}</div>}
                    {o.agentBalance > 0 && <div className="text-blue-600">وكيل: {fmt(o.agentBalance)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Agent Stats */}
        {agentStats && agentStats.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3 text-foreground">أداء الوكلاء</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-right font-medium">الوكيل</th>
                    <th className="pb-2 text-center font-medium">عمرة</th>
                    <th className="pb-2 text-center font-medium">تأشيرات</th>
                    <th className="pb-2 text-left font-medium">إجمالي الأرباح</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((a) => (
                    <tr key={a.agent} className="border-b hover:bg-muted/40">
                      <td className="py-1.5 font-medium">{a.agent}</td>
                      <td className="py-1.5 text-center">{a.umrahCount}</td>
                      <td className="py-1.5 text-center">{a.visasCount}</td>
                      <td className="py-1.5 text-left" dir="ltr">{fmt(a.totalProfit)} ر.س</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: string | number; sub: string; icon: any; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{title}</p>
          <p className="text-lg font-bold text-foreground" dir="ltr">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
        <Icon className={`w-5 h-5 ${color} opacity-80`} />
      </div>
    </Card>
  );
}
