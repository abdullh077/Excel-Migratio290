import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Search, Archive as ArchiveIcon } from "lucide-react";
import { fmt, formatDate } from "@/lib/utils";

async function fetchArchive(search: string) {
  const url = `/api/archive${search ? `?search=${encodeURIComponent(search)}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function ArchivePage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/archive", search],
    queryFn: () => fetchArchive(search),
  });

  const records = Array.isArray(data) ? data : [];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الأرشيف العام</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            سجل شامل لجميع التأشيرات (عمرة وتأشيرات أخرى) للقراءة فقط.
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="بحث شامل بالاسم، الجواز، الجوال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-3 text-right font-medium">م</th>
                  <th className="px-3 py-3 text-right font-medium">العميل</th>
                  <th className="px-3 py-3 text-right font-medium">الوكيل</th>
                  <th className="px-3 py-3 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-3 text-right font-medium">النوع/المصدر</th>
                  <th className="px-3 py-3 text-left font-medium">الشراء</th>
                  <th className="px-3 py-3 text-left font-medium">البيع</th>
                  <th className="px-3 py-3 text-left font-medium">الربح</th>
                  <th className="px-3 py-3 text-right font-medium">المصدر</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      جاري تحميل الأرشيف...
                    </td>
                  </tr>
                )}
                {!isLoading && records.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center text-muted-foreground">
                        <ArchiveIcon className="w-10 h-10 mb-3 opacity-50" />
                        <p className="font-medium">لا توجد سجلات في الأرشيف</p>
                        <p className="mt-1 text-xs">
                          تظهر هنا المعتمرون المنتهية مدتهم وكل التأشيرات الأخرى.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  records.map((r: any, i: number) => (
                    <tr key={`${r.sourceTable}-${r.id ?? i}`} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.clientName}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {r.passportNumber} | {r.phone}
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.agent}</td>
                      <td className="px-3 py-2 text-xs">{formatDate(r.issueDate)}</td>
                      <td className="px-3 py-2">{r.visaType}</td>
                      <td className="px-3 py-2 text-left" dir="ltr">{fmt(r.purchasePrice)}</td>
                      <td className="px-3 py-2 text-left" dir="ltr">{fmt(r.salePrice)}</td>
                      <td className="px-3 py-2 text-left" dir="ltr">
                        <span className={r.profit >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                          {fmt(r.profit)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.source}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
