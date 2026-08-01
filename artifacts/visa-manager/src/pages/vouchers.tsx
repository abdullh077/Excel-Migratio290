import { useState } from "react";
import { useListVouchers, useCreateVoucher, useDeleteVoucher, useGetVoucher, useGetOfficeSettings, useListAgentNames, getListVouchersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Printer, X } from "lucide-react";
import { fmt, formatDate, today } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";

type Voucher = any;

export default function VouchersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const role = me?.role ?? "sub";
  const [kind, setKind] = useState<"all" | "receipt" | "payment">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [printId, setPrintId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ kind: "receipt", partyType: "other", partyName: "", amount: 0, description: "", voucherDate: today() });
  const { data: agentNames = [] } = useListAgentNames();

  const { data: vouchers = [] } = useListVouchers({ kind: kind === "all" ? undefined : kind });
  const create = useCreateVoucher({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListVouchersQueryKey() }); setCreateOpen(false); toast({ title: "تم إنشاء السند" }); } } });
  const del = useDeleteVoucher({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListVouchersQueryKey() }); setDeleteId(null); } } });

  if (role === "sub") return <AppLayout><div className="p-6 text-center text-muted-foreground">غير مخول</div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">السندات</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-primary"><Plus className="w-4 h-4 ml-1" />إنشاء سند</Button>
        </div>

        {/* Kind filter */}
        <div className="flex gap-2 mb-4">
          {(["all", "receipt", "payment"] as const).map((k) => (
            <Button key={k} variant={kind === k ? "default" : "outline"} size="sm" onClick={() => setKind(k)}>
              {k === "all" ? "الكل" : k === "receipt" ? "سندات القبض" : "سندات الصرف"}
            </Button>
          ))}
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">رقم السند</th>
                <th className="px-4 py-3 text-right font-medium">النوع</th>
                <th className="px-4 py-3 text-right font-medium">الطرف</th>
                <th className="px-4 py-3 text-right font-medium">الوصف</th>
                <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                <th className="px-4 py-3 text-left font-medium">المبلغ</th>
                <th className="px-4 py-3 text-center font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد سندات</td></tr>}
              {vouchers.map((v: Voucher) => (
                <tr key={v.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs" dir="ltr">{v.kind === "receipt" ? "R" : "P"}{String(v.id).padStart(4, "0")}</td>
                  <td className="px-4 py-2"><Badge className={v.kind === "receipt" ? "bg-green-100 text-green-800 text-xs" : "bg-orange-100 text-orange-800 text-xs"}>{v.kind === "receipt" ? "قبض" : "صرف"}</Badge></td>
                  <td className="px-4 py-2">{v.partyName}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{v.description ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{formatDate(v.voucherDate)}</td>
                  <td className="px-4 py-2 text-left font-medium" dir="ltr">{fmt(v.amount)} ر.س</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPrintId(v.id)}><Printer className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteId(v.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>إنشاء سند جديد</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>نوع السند</Label><select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}><option value="receipt">سند قبض</option><option value="payment">سند صرف</option></select></div>
              <div className="space-y-1.5"><Label>نوع الطرف</Label><select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.partyType} onChange={(e) => setForm((f) => ({ ...f, partyType: e.target.value }))}><option value="agent">وكيل</option><option value="client">عميل</option><option value="other">أخرى</option></select></div>
              <div className="space-y-1.5">
                <Label>اسم الطرف</Label>
                {form.partyType === "agent" ? (
                  <><Input list="v-agents" value={form.partyName} onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))} /><datalist id="v-agents">{(agentNames as string[]).map((n) => <option key={n} value={n} />)}</datalist></>
                ) : (
                  <Input value={form.partyName} onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))} />
                )}
              </div>
              <div className="space-y-1.5"><Label>المبلغ (ر.س)</Label><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} dir="ltr" className="text-left" /></div>
              <div className="space-y-1.5"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>التاريخ</Label><Input type="date" value={form.voucherDate} onChange={(e) => setForm((f) => ({ ...f, voucherDate: e.target.value }))} dir="ltr" className="text-left" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button onClick={() => create.mutate({ data: form as any })} disabled={create.isPending}>حفظ</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Dialog */}
        {printId && <VoucherPrintDialog id={printId} onClose={() => setPrintId(null)} />}

        <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف السند</AlertDialogTitle><AlertDialogDescription>لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={() => del.mutate({ id: deleteId! })}>حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function VoucherPrintDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: v } = useGetVoucher(id);
  const { data: settings } = useGetOfficeSettings();

  if (!v) return null;

  const voucherNum = `${v.kind === "receipt" ? "R" : "P"}${String(v.id).padStart(4, "0")}`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <div className="flex items-center justify-between mb-2 no-print">
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="w-3.5 h-3.5 ml-1" />طباعة</Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Voucher content — also used in print */}
        <div className="bg-white border-2 border-primary/20 rounded-lg p-6">
          {/* Office header */}
          <div className="flex items-start justify-between border-b pb-3 mb-4">
            <div>
              {settings?.officeLogo && <img src={settings.officeLogo} alt="" className="h-10 object-contain mb-1" />}
              <p className="text-sm font-semibold text-primary">{settings?.officeName ?? "المكتب"}</p>
              {settings?.officePhone && <p className="text-xs text-gray-500" dir="ltr">{settings.officePhone}</p>}
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-400">رقم السند</p>
              <p className="text-lg font-bold text-primary" dir="ltr">{voucherNum}</p>
              <p className="text-xs text-gray-400 mt-1">التاريخ</p>
              <p className="text-sm" dir="ltr">{formatDate(v.voucherDate)}</p>
            </div>
          </div>

          <div className="text-center mb-4">
            <span className={`text-lg font-bold px-4 py-1 rounded-full ${v.kind === "receipt" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}>
              {v.kind === "receipt" ? "سند قبض" : "سند صرف"}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2"><span className="text-gray-600">استلمنا من / دفعنا إلى:</span><span className="font-semibold">{v.partyName}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="text-gray-600">المبلغ:</span><span className="font-bold text-lg" dir="ltr">{fmt(v.amount)} ر.س</span></div>
            {v.description && <div className="flex justify-between border-b pb-2"><span className="text-gray-600">البيان:</span><span>{v.description}</span></div>}
          </div>

          {(settings?.stampImage || settings?.signatureImage) && (
            <div className="flex items-end justify-between mt-8 pt-4 border-t">
              {settings.stampImage && (
                <div className="text-center">
                  <img src={settings.stampImage} alt="ختم" className="h-16 object-contain mx-auto" />
                  <p className="text-xs text-gray-400 mt-1">الختم</p>
                </div>
              )}
              {settings.signatureImage && (
                <div className="text-center">
                  <img src={settings.signatureImage} alt="توقيع" className="h-12 object-contain mx-auto" />
                  <p className="text-xs text-gray-400 mt-1">التوقيع</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
