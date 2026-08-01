import { useState } from "react";
import { useListVisas, useCreateVisa, useUpdateVisa, useDeleteVisa, useListAgentNames, getListVisasQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, MessageCircle, Printer } from "lucide-react";
import { fmt, formatDate, today } from "@/lib/utils";
import { useGetOfficeSettings } from "@workspace/api-client-react";
import { Link } from "wouter";

type Visa = any;
const EMPTY: Visa = { clientName: "", passportNumber: "", requestNumber: "", phone: "", agent: "", issueDate: today(), visaType: "", issuingAuthority: "", transactionParty: "", purchasePrice: 0, salePrice: 0, receivedFromClient: 0, transferredToAgent: 0, sendStatus: "pending", notes: "" };

export default function VisasPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Visa>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: visas = [], isLoading } = useListVisas({});
  const { data: agentNames = [] } = useListAgentNames();
  const { data: settings } = useGetOfficeSettings();
  const create = useCreateVisa({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListVisasQueryKey() }); setDialogOpen(false); } } });
  const upd = useUpdateVisa({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListVisasQueryKey() }); setDialogOpen(false); } } });
  const del = useDeleteVisa({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListVisasQueryKey() }); setDeleteId(null); } } });

  const filtered = visas.filter((v: Visa) =>
    !search || v.clientName.includes(search) || v.passportNumber.includes(search) || v.requestNumber?.includes(search) || v.agent.includes(search)
  );

  function openNew() { setForm({ ...EMPTY }); setEditing(null); setDialogOpen(true); }
  function openEdit(v: Visa) { setForm({ ...v }); setEditing(v.id); setDialogOpen(true); }
  function handleSubmit() {
    const { id, profit, clientBalance, agentBalance, createdAt, ...data } = form;
    if (editing) { upd.mutate({ id: editing, data }); }
    else { create.mutate({ data: { ...data, clientRequestId: crypto.randomUUID() } }); }
  }

  function whatsappLink(v: Visa) {
    const template = settings?.whatsappOtherTemplate ?? "مرحباً {name}، تأشيرتك جاهزة.";
    const msg = template.replace("{name}", v.clientName).replace("{passport}", v.passportNumber);
    const phone = v.phone.replace(/\D/g, "");
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">التأشيرات الأخرى</h1>
          <Button onClick={openNew} size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />إضافة تأشيرة</Button>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-3 text-right font-medium">العميل</th>
                  <th className="px-3 py-3 text-right font-medium">الجواز</th>
                  <th className="px-3 py-3 text-right font-medium">النوع</th>
                  <th className="px-3 py-3 text-right font-medium">الوكيل</th>
                  <th className="px-3 py-3 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-3 text-left font-medium">البيع</th>
                  <th className="px-3 py-3 text-left font-medium">استلم</th>
                  <th className="px-3 py-3 text-left font-medium">رصيد العميل</th>
                  <th className="px-3 py-3 text-left font-medium">رصيد الوكيل</th>
                  <th className="px-3 py-3 text-right font-medium">الحالة</th>
                  <th className="px-3 py-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">لا توجد سجلات</td></tr>}
                {filtered.map((v: Visa) => (
                  <tr key={v.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{v.clientName}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs" dir="ltr">{v.passportNumber}</td>
                    <td className="px-3 py-2">{v.visaType}</td>
                    <td className="px-3 py-2">{v.agent}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(v.issueDate)}</td>
                    <td className="px-3 py-2 text-left" dir="ltr">{fmt(v.salePrice)}</td>
                    <td className="px-3 py-2 text-left" dir="ltr">{fmt(v.receivedFromClient)}</td>
                    <td className="px-3 py-2 text-left">
                      <span className={v.clientBalance > 0 ? "text-orange-600 font-medium" : "text-green-600"} dir="ltr">{fmt(v.clientBalance)}</span>
                    </td>
                    <td className="px-3 py-2 text-left">
                      <span className={v.agentBalance > 0 ? "text-blue-600 font-medium" : "text-green-600"} dir="ltr">{fmt(v.agentBalance)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <SendBadge status={v.sendStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <a href={whatsappLink(v)} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-green-600"><MessageCircle className="w-3.5 h-3.5" /></Button>
                        </a>
                        <Link href={`/receipt/visa/${v.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2"><Printer className="w-3.5 h-3.5" /></Button>
                        </Link>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteId(v.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل تأشيرة" : "إضافة تأشيرة جديدة"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2 max-h-[70vh] overflow-y-auto">
              <F label="اسم العميل" val={form.clientName} set={(v: string) => setForm((f: any) => ({ ...f, clientName: v }))} />
              <F label="رقم الجواز" val={form.passportNumber} set={(v: string) => setForm((f: any) => ({ ...f, passportNumber: v }))} ltr />
              <F label="رقم الطلب" val={form.requestNumber} set={(v: string) => setForm((f: any) => ({ ...f, requestNumber: v }))} ltr />
              <F label="رقم الهاتف" val={form.phone} set={(v: string) => setForm((f: any) => ({ ...f, phone: v }))} ltr />
              <div className="space-y-1.5">
                <Label>الوكيل</Label>
                <Input list="agent-list-v" value={form.agent} onChange={(e) => setForm((f: any) => ({ ...f, agent: e.target.value }))} />
                <datalist id="agent-list-v">{(agentNames as string[]).map((n) => <option key={n} value={n} />)}</datalist>
              </div>
              <F label="تاريخ الإصدار" val={form.issueDate} set={(v: string) => setForm((f: any) => ({ ...f, issueDate: v }))} type="date" />
              <F label="نوع التأشيرة" val={form.visaType} set={(v: string) => setForm((f: any) => ({ ...f, visaType: v }))} />
              <F label="جهة الإصدار" val={form.issuingAuthority} set={(v: string) => setForm((f: any) => ({ ...f, issuingAuthority: v }))} />
              <F label="جهة المعاملة" val={form.transactionParty ?? ""} set={(v: string) => setForm((f: any) => ({ ...f, transactionParty: v }))} />
              <F label="سعر الشراء (ر.س)" val={String(form.purchasePrice)} set={(v: string) => setForm((f: any) => ({ ...f, purchasePrice: Number(v) }))} type="number" />
              <F label="سعر البيع (ر.س)" val={String(form.salePrice)} set={(v: string) => setForm((f: any) => ({ ...f, salePrice: Number(v) }))} type="number" />
              <F label="المستلم من العميل (ر.س)" val={String(form.receivedFromClient)} set={(v: string) => setForm((f: any) => ({ ...f, receivedFromClient: Number(v) }))} type="number" />
              <F label="المحول للوكيل (ر.س)" val={String(form.transferredToAgent)} set={(v: string) => setForm((f: any) => ({ ...f, transferredToAgent: Number(v) }))} type="number" />
              <div className="space-y-1.5">
                <Label>حالة الإرسال</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.sendStatus} onChange={(e) => setForm((f: any) => ({ ...f, sendStatus: e.target.value }))}>
                  <option value="pending">قيد الانتظار</option>
                  <option value="sent">تم الإرسال</option>
                  <option value="delivered">تم التسليم</option>
                </select>
              </div>
              <F label="ملاحظات" val={form.notes ?? ""} set={(v: string) => setForm((f: any) => ({ ...f, notes: v }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || upd.isPending}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذا السجل؟</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white" onClick={() => del.mutate({ id: deleteId! })}>حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function SendBadge({ status }: { status: string }) {
  if (status === "pending" || status === "قيد الانتظار") return <Badge variant="outline" className="text-xs">قيد الانتظار</Badge>;
  if (status === "sent" || status === "تم الإرسال") return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">تم الإرسال</Badge>;
  if (status === "delivered" || status === "تم التسليم") return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">تم التسليم</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function F({ label, val, set, type = "text", ltr = false }: any) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={val} onChange={(e) => set(e.target.value)} dir={ltr ? "ltr" : undefined} className={ltr ? "text-left" : ""} />
    </div>
  );
}
