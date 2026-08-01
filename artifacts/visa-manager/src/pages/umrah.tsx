import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, MessageCircle, Printer } from "lucide-react";
import { fmt, formatDate, parseDate, today } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
// NOTE: src/lib/outbox.ts is created by another agent; API: enqueue(kind, payload, label)
import { enqueue } from "@/lib/outbox";

type Umrah = any;

const DEFAULT_TEMPLATE =
  "السلام عليكم ورحمة الله،\nمن {office}.\nنذكّركم بقرب انتهاء مدة إقامة العمرة الخاصة بالمعتمر: {name}.\nالمتبقّي: {days} يوماً.\nنرجو التكرم بمراجعتنا لإتمام إجراءات المغادرة في الوقت المحدد.\nشاكرين لكم حسن تعاونكم.";

const EMPTY = {
  clientName: "",
  passportNumber: "",
  phone: "",
  agent: "",
  client: "",
  openingBalance: "",
  issueDate: today(),
  stayDuration: 90,
  entryDate: "",
  transactionParty: "",
  sendStatus: "قيد الانتظار",
  purchasePrice: 0,
  salePrice: 0,
  notes: "",
};

type Errors = Partial<Record<string, string>>;

async function apiGet(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Counter: if entryDate, expiry = entryDate + 90 days; otherwise issueDate + stayDuration days.
// difference rounded days vs local today at midnight. null if invalid.
function computeDays(row: Umrah): number | null {
  let expiry: Date | null = null;
  if (row.entryDate) {
    const e = parseDate(row.entryDate);
    if (!e) return null;
    expiry = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 90);
  } else {
    const i = parseDate(row.issueDate);
    if (!i) return null;
    const dur = Number(row.stayDuration);
    if (isNaN(dur)) return null;
    expiry = new Date(i.getFullYear(), i.getMonth(), i.getDate() + dur);
  }
  if (!expiry || isNaN(expiry.getTime())) return null;
  const now = new Date();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const midnightExpiry = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  return Math.round((midnightExpiry.getTime() - midnightToday.getTime()) / 86400000);
}

export default function UmrahPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Umrah>({ ...EMPTY });
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const qc = useQueryClient();
  const { toast } = useToast();

  const listKey = ["umrah", search];
  const { data: clients = [], isLoading } = useQuery<Umrah[]>({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const qs = params.toString();
      return apiGet(`/api/umrah${qs ? `?${qs}` : ""}`);
    },
  });

  const { data: agentNames = [] } = useQuery<string[]>({
    queryKey: ["agent-names"],
    queryFn: () => apiGet("/api/statement/agent-names"),
    staleTime: 60000,
  });

  const { data: settings } = useQuery<any>({
    queryKey: ["office-settings"],
    queryFn: () => apiGet("/api/settings/office"),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["umrah"] });
  }

  const create = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/umrah", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "تم الحفظ بنجاح" });
    },
    onError: () => {
      toast({ title: "تعذّر الحفظ", description: "حدث خطأ، يرجى المحاولة مرة أخرى", variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`/api/umrah/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "تعذّر التعديل", description: "حدث خطأ، يرجى المحاولة مرة أخرى", variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/umrah/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      // DELETE may return JSON ({message}) or an empty body; don't assume either.
      return true;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "تم الحذف بنجاح" });
    },
    onError: () => {
      toast({ title: "تعذّر الحذف", description: "حدث خطأ، يرجى المحاولة مرة أخرى", variant: "destructive" });
    },
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`/api/umrah/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  function openNew() {
    setForm({ ...EMPTY, issueDate: today() });
    setEditing(null);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(c: Umrah) {
    setForm({
      clientName: c.clientName ?? "",
      passportNumber: c.passportNumber ?? "",
      phone: c.phone ?? "",
      agent: c.agent ?? "",
      client: c.client ?? "",
      openingBalance: "",
      issueDate: c.issueDate ? String(c.issueDate).slice(0, 10) : today(),
      stayDuration: c.stayDuration ?? 90,
      entryDate: c.entryDate ? String(c.entryDate).slice(0, 10) : "",
      transactionParty: c.transactionParty ?? "",
      sendStatus: c.sendStatus ?? "قيد الانتظار",
      purchasePrice: c.purchasePrice ?? 0,
      salePrice: c.salePrice ?? 0,
      notes: c.notes ?? "",
    });
    setEditing(c.id);
    setErrors({});
    setDialogOpen(true);
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!form.clientName?.trim()) e.clientName = "الاسم مطلوب";
    if (!form.passportNumber?.trim()) e.passportNumber = "رقم الجواز مطلوب";
    if (!form.phone?.trim()) e.phone = "رقم الجوال مطلوب";
    if (!form.agent?.trim()) e.agent = "الوكيل مطلوب";
    if (!form.issueDate?.trim()) e.issueDate = "تاريخ الإصدار مطلوب";
    if (form.stayDuration === "" || form.stayDuration == null || isNaN(Number(form.stayDuration)))
      e.stayDuration = "المدة مطلوبة";
    if (form.openingBalance !== "" && isNaN(Number(form.openingBalance))) e.openingBalance = "يجب أن يكون رقماً";
    if (form.purchasePrice === "" || isNaN(Number(form.purchasePrice))) e.purchasePrice = "يجب أن يكون رقماً";
    if (form.salePrice === "" || isNaN(Number(form.salePrice))) e.salePrice = "يجب أن يكون رقماً";
    return e;
  }

  function handleSubmit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const payload: any = {
      clientName: form.clientName,
      passportNumber: form.passportNumber,
      phone: form.phone,
      agent: form.agent,
      client: form.client?.trim() || "",
      issueDate: form.issueDate,
      stayDuration: Number(form.stayDuration),
      entryDate: form.entryDate || undefined,
      transactionParty: form.transactionParty || "",
      sendStatus: form.sendStatus,
      purchasePrice: Number(form.purchasePrice),
      salePrice: Number(form.salePrice),
      notes: form.notes || "",
    };
    if (form.openingBalance !== "" && !isNaN(Number(form.openingBalance))) {
      payload.openingBalance = Number(form.openingBalance);
    }

    if (editing) {
      update.mutate({ id: editing, payload });
      return;
    }

    if (!navigator.onLine) {
      enqueue("umrah", payload, form.clientName);
      setDialogOpen(false);
      toast({ title: "حُفظت مؤقتاً على الجهاز", description: "ستُرفع تلقائياً عند عودة الإنترنت" });
      return;
    }

    create.mutate(payload);
  }

  function handleDelete(id: number) {
    if (!window.confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    remove.mutate(id);
  }

  function handleEntry(c: Umrah) {
    patchStatus.mutate(
      { id: c.id, payload: { entryDate: new Date().toISOString() } },
      { onSuccess: () => toast({ title: "تم تسجيل دخول المملكة", description: "بدأ العدّ التنازلي لمدة 90 يوماً" }) }
    );
  }

  function buildMessage(c: Umrah): string {
    const officeName = settings?.officeName || "مكتبنا";
    const tpl = (settings?.whatsappUmrahTemplate?.trim() || "") || DEFAULT_TEMPLATE;
    const days = computeDays(c);
    const daysStr = days == null ? "غير محدد" : String(days);
    return tpl
      .replace(/\{office\}/g, officeName)
      .replace(/\{name\}/g, c.clientName ?? "")
      .replace(/\{days\}/g, daysStr)
      .replace(/\{[^}]*\}/g, "");
  }

  async function handleWhatsApp(c: Umrah) {
    // Open the tab synchronously (popup blockers), then point it at the
    // freshest record so an edited phone number is used immediately.
    const win = window.open("", "_blank");
    let fresh: Umrah = c;
    try {
      fresh = await apiGet(`/api/umrah/${c.id}`);
    } catch {
      // offline or transient error — fall back to the row we have
    }
    const message = buildMessage(fresh);
    const phone = String(fresh.phone ?? "").replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    if (win) win.location.href = url;
    else window.open(url, "_blank");
    patchStatus.mutate({ id: c.id, payload: { sendStatus: "تم الإرسال" } });
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold">عملاء العمرة</h1>
            <p className="text-sm text-muted-foreground mt-1">إدارة بيانات المعتمرين وحالات التأشيرات الخاصة بهم.</p>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="w-4 h-4 ml-1" />
            إضافة عميل جديد
          </Button>
        </div>

        <div className="relative my-4 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="بحث شامل في جميع الحقول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-3 text-right font-medium">م</th>
                  <th className="px-3 py-3 text-right font-medium">اسم الجواز</th>
                  <th className="px-3 py-3 text-right font-medium">الوكيل</th>
                  <th className="px-3 py-3 text-right font-medium">العميل</th>
                  <th className="px-3 py-3 text-right font-medium">الإصدار</th>
                  <th className="px-3 py-3 text-right font-medium">الشراء</th>
                  <th className="px-3 py-3 text-right font-medium">البيع</th>
                  <th className="px-3 py-3 text-right font-medium">الربح</th>
                  <th className="px-3 py-3 text-right font-medium">الإرسال</th>
                  <th className="px-3 py-3 text-right font-medium">داخل المملكة</th>
                  <th className="px-3 py-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-muted-foreground">
                      جاري التحميل...
                    </td>
                  </tr>
                )}
                {!isLoading && clients.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-muted-foreground">
                      <div className="font-medium">لا يوجد معتمرون</div>
                      <div className="text-xs mt-1">أضف أول معتمر بالضغط على زر «إضافة عميل جديد».</div>
                    </td>
                  </tr>
                )}
                {clients.map((c: Umrah, idx: number) => {
                  const days = computeDays(c);
                  return (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{c.clientName}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {c.passportNumber} | {c.phone}
                        </div>
                      </td>
                      <td className="px-3 py-2">{c.agent}</td>
                      <td className="px-3 py-2">{c.client || "—"}</td>
                      <td className="px-3 py-2">
                        <div>{formatDate(c.issueDate)}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.stayDuration} يوم
                        </div>
                      </td>
                      <td className="px-3 py-2" dir="ltr">{fmt(c.purchasePrice)}</td>
                      <td className="px-3 py-2" dir="ltr">{fmt(c.salePrice)}</td>
                      <td className="px-3 py-2" dir="ltr">{fmt(c.profit)}</td>
                      <td className="px-3 py-2">
                        <SendStatusBadge status={c.sendStatus} />
                      </td>
                      <td className="px-3 py-2">
                        {c.entryDate ? (
                          <div>
                            {days != null && (
                              <CounterBadge days={days} />
                            )}
                            <div className="text-xs text-muted-foreground mt-1">دخل: {formatDate(c.entryDate)}</div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="secondary" className="bg-gray-100 text-gray-600">خارج المملكة</Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-green-700"
                              onClick={() => handleEntry(c)}
                            >
                              تسجيل الدخول
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            title="تعديل"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <a href={`/receipt/${c.id}?type=umrah`} title="طباعة سند">
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-green-600"
                            title="تذكير واتساب"
                            onClick={() => handleWhatsApp(c)}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive"
                            title="حذف"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل بيانات المعتمر" : "إضافة معتمر جديد"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2 overflow-visible">
              <Field label="اسم الجواز" required value={form.clientName} onChange={(v) => setForm((f: any) => ({ ...f, clientName: v }))} error={errors.clientName} />
              <Field label="رقم الجواز" required ltr value={form.passportNumber} onChange={(v) => setForm((f: any) => ({ ...f, passportNumber: v }))} error={errors.passportNumber} />
              <div className="space-y-1.5">
                <Label>الوكيل<span className="text-destructive mr-1">*</span></Label>
                <Input
                  list="agent-list-umrah"
                  placeholder="اختر من الوكلاء أو اكتب اسماً"
                  value={form.agent}
                  onChange={(e) => setForm((f: any) => ({ ...f, agent: e.target.value }))}
                />
                <datalist id="agent-list-umrah">
                  {(agentNames as string[]).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                {errors.agent && <p className="text-xs text-destructive">{errors.agent}</p>}
              </div>
              <Field label="اسم العميل (يُقيَّد عليه البيع في كشف الحساب)" placeholder="اتركه فارغاً إن لم يوجد" value={form.client} onChange={(v) => setForm((f: any) => ({ ...f, client: v }))} />
              <Field label="رقم الجوال" required ltr value={form.phone} onChange={(v) => setForm((f: any) => ({ ...f, phone: v }))} error={errors.phone} />
              <Field label="تاريخ الإصدار" required type="date" value={form.issueDate} onChange={(v) => setForm((f: any) => ({ ...f, issueDate: v }))} error={errors.issueDate} />
              <Field label="مدة الإقامة (يوم)" required type="number" value={String(form.stayDuration)} onChange={(v) => setForm((f: any) => ({ ...f, stayDuration: v === "" ? "" : Number(v) }))} error={errors.stayDuration} />
              <Field label="تاريخ دخول المملكة (اختياري)" type="date" value={form.entryDate} onChange={(v) => setForm((f: any) => ({ ...f, entryDate: v }))} />
              <Field label="ترحيل عبر (يظهر في السند)" placeholder="ترحيل عبر" value={form.transactionParty} onChange={(v) => setForm((f: any) => ({ ...f, transactionParty: v }))} />
              <div className="space-y-1.5">
                <Label>حالة الإرسال</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.sendStatus}
                  onChange={(e) => setForm((f: any) => ({ ...f, sendStatus: e.target.value }))}
                >
                  <option value="قيد الانتظار">قيد الانتظار</option>
                  <option value="تم الإرسال">تم الإرسال</option>
                  <option value="تم التسليم">تم التسليم</option>
                </select>
              </div>
              <Field label="سعر الشراء" required type="number" min={0} value={String(form.purchasePrice)} onChange={(v) => setForm((f: any) => ({ ...f, purchasePrice: v === "" ? "" : Number(v) }))} error={errors.purchasePrice} />
              <Field label="سعر البيع" required type="number" min={0} value={String(form.salePrice)} onChange={(v) => setForm((f: any) => ({ ...f, salePrice: v === "" ? "" : Number(v) }))} error={errors.salePrice} />
              <Field label="الرصيد الافتتاحي للعميل (اختياري)" type="number" value={String(form.openingBalance)} onChange={(v) => setForm((f: any) => ({ ...f, openingBalance: v }))} error={errors.openingBalance} />
              <Field label="ملاحظات" value={form.notes} onChange={(v) => setForm((f: any) => ({ ...f, notes: v }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>حفظ البيانات</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function CounterBadge({ days }: { days: number }) {
  if (days <= 0) {
    return <span className="text-red-600 font-bold text-sm">تجاوز {Math.abs(days)} يوم</span>;
  }
  if (days <= 10) {
    return <span className="text-red-600 font-bold text-sm">متبقٍ {days} يوم</span>;
  }
  return <span className="text-green-600 font-bold text-sm">متبقٍ {days} يوم</span>;
}

function SendStatusBadge({ status }: { status: string }) {
  if (status === "تم التسليم") return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">تم التسليم</Badge>;
  if (status === "تم الإرسال") return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">تم الإرسال</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-gray-300 text-xs">قيد الانتظار</Badge>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ltr = false,
  required = false,
  placeholder,
  error,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  ltr?: boolean;
  required?: boolean;
  placeholder?: string;
  error?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
      </Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        dir={ltr ? "ltr" : undefined}
        className={ltr ? "text-left" : ""}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
