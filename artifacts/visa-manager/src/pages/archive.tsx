import { useState } from "react";
import { useListArchive } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { fmt, formatDate } from "@/lib/utils";

export default function ArchivePage() {
  const [search, setSearch] = useState("");
  const { data: records = [], isLoading } = useListArchive({ search: search || undefined });

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">الأرشيف العام</h1>
          <span className="text-sm text-muted-foreground">{records.length} سجل</span>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث بالاسم أو الجواز..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-3 text-right font-medium">العميل</th>
                  <th className="px-3 py-3 text-right font-medium">جواز السفر</th>
                  <th className="px-3 py-3 text-right font-medium">الهاتف</th>
                  <th className="px-3 py-3 text-right font-medium">النوع</th>
                  <th className="px-3 py-3 text-right font-medium">الوكيل</th>
                  <th className="px-3 py-3 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-3 text-left font-medium">سعر البيع</th>
                  <th className="px-3 py-3 text-left font-medium">الربح</th>
                  <th className="px-3 py-3 text-right font-medium">المصدر</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
                {!isLoading && records.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد سجلات</td></tr>}
                {records.map((r: any) => (
                  <tr key={`${r.sourceTable}-${r.id}`} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.clientName}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">{r.passportNumber}</td>
                    <td className="px-3 py-2 text-xs" dir="ltr">{r.phone}</td>
                    <td className="px-3 py-2">{r.visaType}</td>
                    <td className="px-3 py-2">{r.agent}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(r.issueDate)}</td>
                    <td className="px-3 py-2 text-left" dir="ltr">{fmt(r.salePrice)} ر.س</td>
                    <td className="px-3 py-2 text-left">
                      <span className={r.profit >= 0 ? "text-green-700 font-medium" : "text-red-600"} dir="ltr">{fmt(r.profit)} ر.س</span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">{r.sourceTable === "umrah" ? "عمرة" : "تأشيرة"}</Badge>
                    </td>
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
