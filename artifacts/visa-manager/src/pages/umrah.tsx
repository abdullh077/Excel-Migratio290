import { useState } from "react";
import { useListUmrahClients, useCreateUmrahClient, useUpdateUmrahClient, useDeleteUmrahClient, useListAgentNames, getListUmrahClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, MessageCircle, Printer, LogIn } from "lucide-react";
import { fmt, formatDate, daysRemaining, today } from "@/lib/utils";
import { useGetOfficeSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type Client = any;
const EMPTY: Client = { clientName: "", passportNumber: "", phone: "", agent: "", issueDate: today(), stayDuration: 30, issuingAuthority: "", transactionParty: "", purchasePrice: 0, salePrice: 0, sendStatus: "pending", notes: "" };

export default function UmrahPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [entryId, setEntryId] = useState<number | null>(null);
  const [form, setForm] = useState<Client>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: clients = [], isLoading } = useListUmrahClients({});
  const { data: agentNames = [] } = useListAgentNames();
  const { data: settings } = useGetOfficeSettings();
  const create = useCreateUmrahClient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUmrahClientsQueryKey() }); setDialogOpen(false); } } });
  const update = useUpdateUmrahClient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUmrahClientsQueryKey() }); setDialogOpen(false); } } });
  const del = useDeleteUmrahClient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUmrahClientsQueryKey() }); setDeleteId(null); } } });
  const setEntry = useUpdateUmrahClient({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListUmrahClientsQueryKey() }); setEntryId(null); toast({ title: "تم تسجيل الدخول" }); } } });

  const filtered = clients.filter((c: Client) =>
    !search || c.clientName.includes(search) || c.passportNumber.includes(search) || c.agent.includes(search)
  );

  function openNew() { setForm({ ...EMPTY }); setEditing(null); setDialogOpen(true); }
  function openEdit(c: Client) { setForm({ ...c }); setEditing(c.id); setDialogOpen(true); }
  function handleSubmit() {
    const { id, profit, status, createdAt, ...data } = form;
    if (editing) { update.mutate({ id: editing, data }); }
    else { create.mutate({ data: { ...data, clientRequestId: crypto.randomUUID() } }); }
  }

  function whatsappLink(c: Client) {
    const template = settings?.whatsappUmrahTemplate ?? "مرحباً {name}، تأشيرة العمرة الخاصة بك جاهزة.";
    const msg = template.replace("{name}", c.clientName).replace("{passport}", c.passportNumber);
    const phone = c.phone.replace(/\D/g, "");
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">معتمرو العمرة</h1>
          <Button onClick={openNew} size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />إضافة معتمر</Button>
        </div>

        {/* Search */}
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث بالاسم أو جواز السفر أو الوكيل..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Table */}
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">العميل</th>
                  <th className="px-4 py-3 text-right font-medium">جواز السفر</th>
                  <th className="px-4 py-3 text-right font-medium">الوكيل</th>
                  <th className="px-4 py-3 text-right font-medium">تاريخ الإصدار</th>
                  <th className="px-4 py-3 text-right font-medium">الحالة</th>
                  <th className="px-4 py-3 text-right font-medium">الأيام المتبقية</th>
                  <th className="px-4 py-3 text-right font-medium">سعر البيع</th>
                  <th className="px-4 py-3 text-right font-medium">الحالة</th>
                  <th className="px-4 py-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد سجلات</td></tr>}
                {filtered.map((c: Client) => {
                  const days = daysRemaining(c.entryDate, c.stayDuration);
                  const inside = c.status === "داخل المملكة";
                  return (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{c.clientName}</td>
                      <td className="px-4 py-2 text-muted-foreground" dir="ltr">{c.passportNumber}</td>
                      <td className="px-4 py-2">{c.agent}</td>
                      <td className="px-4 py-2">{formatDate(c.issueDate)}</td>
                      <td className="px-4 py-2">
                        <Badge variant={inside ? "default" : "secondary"} className={inside ? "bg-green-100 text-green-800 border-green-300" : "bg-gray-100 text-gray-600"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {days != null ? (
                          <span className={days < 10 ? "text-red-600 font-bold" : ""}>{days} يوم</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2" dir="ltr">{fmt(c.salePrice)} ر.س</td>
                      <td className="px-4 py-2">
                        <SendStatusBadge status={c.sendStatus} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {!inside && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-green-700" title="تسجيل الدخول" onClick={() => setEntryId(c.id)}>
                              <LogIn className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <a href={whatsappLink(c)} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-green-600"><MessageCircle className="w-3.5 h-3.5" /></Button>
                          </a>
                          <Link href={`/receipt/umrah/${c.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2"><Printer className="w-3.5 h-3.5" /></Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader><DialogTitle>{editing ? "تعديل معتمر" : "إضافة معتمر جديد"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2 max-h-[70vh] overflow-y-auto">
              <Field label="اسم العميل" value={form.clientName} onChange={(v) => setForm((f: any) => ({ ...f, clientName: v }))} required />
              <Field label="رقم الجواز" value={form.passportNumber} onChange={(v) => setForm((f: any) => ({ ...f, passportNumber: v }))} ltr />
              <Field label="رقم الهاتف" value={form.phone} onChange={(v) => setForm((f: any) => ({ ...f, phone: v }))} ltr />
              <AgentField label="الوكيل" value={form.agent} onChange={(v) => setForm((f: any) => ({ ...f, agent: v }))} agentNames={agentNames as string[]} />
              <Field label="تاريخ الإصدار" value={form.issueDate} onChange={(v) => setForm((f: any) => ({ ...f, issueDate: v }))} type="date" />
              <Field label="مدة الإقامة (أيام)" value={String(form.stayDuration)} onChange={(v) => setForm((f: any) => ({ ...f, stayDuration: Number(v) }))} type="number" />
              <Field label="جهة الإصدار" value={form.issuingAuthority} onChange={(v) => setForm((f: any) => ({ ...f, issuingAuthority: v }))} />
              <Field label="جهة المعاملة" value={form.transactionParty ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, transactionParty: v }))} />
              <Field label="سعر الشراء (ر.س)" value={String(form.purchasePrice)} onChange={(v) => setForm((f: any) => ({ ...f, purchasePrice: Number(v) }))} type="number" />
              <Field label="سعر البيع (ر.س)" value={String(form.salePrice)} onChange={(v) => setForm((f: any) => ({ ...f, salePrice: Number(v) }))} type="number" />
              <div className="space-y-1.5">
                <Label>حالة الإرسال</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.sendStatus} onChange={(e) => setForm((f: any) => ({ ...f, sendStatus: e.target.value }))}>
                  <option value="pending">قيد الانتظار</option>
                  <option value="sent">تم الإرسال</option>
                  <option value="delivered">تم التسليم</option>
                </select>
              </div>
              <Field label="ملاحظات" value={form.notes ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, notes: v }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذا السجل؟</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white" onClick={() => del.mutate({ id: deleteId! })}>حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Entry date confirm */}
        <AlertDialog open={entryId != null} onOpenChange={(o) => { if (!o) setEntryId(null); }}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader><AlertDialogTitle>تسجيل الدخول للمملكة</AlertDialogTitle><AlertDialogDescription>هل تريد تسجيل تاريخ الدخول الآن ({new Date().toLocaleDateString("ar-SA")})?</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => setEntry.mutate({ id: entryId!, data: { entryDate: new Date().toISOString() } })}>تأكيد</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function SendStatusBadge({ status }: { status: string }) {
  if (status === "pending" || status === "قيد الانتظار") return <Badge variant="outline" className="text-xs">قيد الانتظار</Badge>;
  if (status === "sent" || status === "تم الإرسال") return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">تم الإرسال</Badge>;
  if (status === "delivered" || status === "تم التسليم") return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">تم التسليم</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function Field({ label, value, onChange, type = "text", ltr = false, required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; ltr?: boolean; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive mr-1">*</span>}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} dir={ltr ? "ltr" : undefined} className={ltr ? "text-left" : ""} />
    </div>
  );
}

function AgentField({ label, value, onChange, agentNames }: { label: string; value: string; onChange: (v: string) => void; agentNames: string[] }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input list="agent-list" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="agent-list">{agentNames.map((n: string) => <option key={n} value={n} />)}</datalist>
    </div>
  );
}
