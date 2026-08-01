import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2, MessageCircle, Printer } from "lucide-react";
import { fmt, formatDate, today } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
// NOTE: src/lib/outbox.ts is created by another agent; API: enqueue(kind, payload, label)
import { enqueue } from "@/lib/outbox";

type Visa = any;

const VISA_TYPES = ["زيارة عائلية", "زيارة شخصية", "تأشيرة عمل", "علاج", "سياحة", "دراسية", "أخرى"];

const DEFAULT_TEMPLATE =
  "السلام عليكم ورحمة الله،\nعزيزنا {name}،\nمعكم {office}.\nبخصوص تأشيرتكم من نوع ({visaType})، نرجو التواصل معنا لأي استفسار أو لاستكمال الإجراءات.\nشاكرين لكم.";

const EMPTY = {
  clientName: "",
  passportNumber: "",
  requestNumber: "",
  phone: "",
  agent: "",
  issueDate: today(),
  visaType: "زيارة عائلية",
  issuingAuthority: "السعودية",
  transactionParty: "",
  purchasePrice: 0,
  salePrice: 0,
  receivedFromClient: 0,
  transferredToAgent: 0,
  notes: "",
};

type Errors = Partial<Record<string, string>>;

async function apiGet(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function VisasPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Visa>({ ...EMPTY });
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: visas = [], isLoading } = useQuery<Visa[]>({
    queryKey: ["visas", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const qs = params.toString();
      return apiGet(`/api/visas${qs ? `?${qs}` : ""}`);
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
    qc.invalidateQueries({ queryKey: ["visas"] });
  }

  const create = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/visas", {
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
      const res = await fetch(`/api/visas/${id}`, {
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
      const res = await fetch(`/api/visas/${id}`, { method: "DELETE", credentials: "include" });
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
      const res = await fetch(`/api/visas/${id}`, {
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

  function openEdit(v: Visa) {
    setForm({
      clientName: v.clientName ?? "",
      passportNumber: v.passportNumber ?? "",
      requestNumber: v.requestNumber ?? "",
      phone: v.phone ?? "",
      agent: v.agent ?? "",
      issueDate: v.issueDate ? String(v.issueDate).slice(0, 10) : today(),
      visaType: v.visaType ?? "زيارة عائلية",
      issuingAuthority: v.issuingAuthority ?? "السعودية",
      transactionParty: v.transactionParty ?? "",
      purchasePrice: v.purchasePrice ?? 0,
      salePrice: v.salePrice ?? 0,
      receivedFromClient: v.receivedFromClient ?? 0,
      transferredToAgent: v.transferredToAgent ?? 0,
      notes: v.notes ?? "",
    });
    setEditing(v.id);
    setErrors({});
    setDialogOpen(true);
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!form.clientName?.trim()) e.clientName = "الاسم مطلوب";
    if (!form.passportNumber?.trim()) e.passportNumber = "رقم الجواز مطلوب";
    if (!form.requestNumber?.trim()) e.requestNumber = "رقم الطلب مطلوب";
    if (!form.phone?.trim()) e.phone = "رقم الجوال مطلوب";
    if (!form.agent?.trim()) e.agent = "الوكيل مطلوب";
    if (!form.issueDate?.trim()) e.issueDate = "تاريخ الإصدار مطلوب";
    if (!form.visaType?.trim()) e.visaType = "نوع التأشيرة مطلوب";
    if (!form.issuingAuthority?.trim()) e.issuingAuthority = "جهة الإصدار مطلوبة";
    if (form.purchasePrice === "" || isNaN(Number(form.purchasePrice))) e.purchasePrice = "يجب أن يكون رقماً";
    if (form.salePrice === "" || isNaN(Number(form.salePrice))) e.salePrice = "يجب أن يكون رقماً";
    if (form.receivedFromClient === "" || isNaN(Number(form.receivedFromClient))) e.receivedFromClient = "يجب أن يكون رقماً";
    if (form.transferredToAgent === "" || isNaN(Number(form.transferredToAgent))) e.transferredToAgent = "يجب أن يكون رقماً";
    return e;
  }

  function handleSubmit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const payload: any = {
      clientName: form.clientName,
      passportNumber: form.passportNumber,
      requestNumber: form.requestNumber,
      phone: form.phone,
      agent: form.agent,
      issueDate: form.issueDate,
      visaType: form.visaType,
      issuingAuthority: form.issuingAuthority,
      transactionParty: form.transactionParty || "",
      purchasePrice: Number(form.purchasePrice),
      salePrice: Number(form.salePrice),
      receivedFromClient: Number(form.receivedFromClient),
      transferredToAgent: Number(form.transferredToAgent),
      notes: form.notes || "",
    };

    if (editing) {
      update.mutate({ id: editing, payload });
      return;
    }

    if (!navigator.onLine) {
      enqueue("visa", payload, form.clientName);
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

  function buildMessage(v: Visa): string {
    const officeName = settings?.officeName || "مكتبنا";
    const tpl = (settings?.whatsappOtherTemplate?.trim() || "") || DEFAULT_TEMPLATE;
    return tpl
      .replace(/\{office\}/g, officeName)
      .replace(/\{name\}/g, v.clientName ?? "")
      .replace(/\{visaType\}/g, v.visaType ?? "")
      .replace(/\{[^}]*\}/g, "");
  }

  async function handleWhatsApp(v: Visa) {
    // Open the tab synchronously (popup blockers), then point it at the
    // freshest record so an edited phone number is used immediately.
    const win = window.open("", "_blank");
    let fresh: Visa = v;
    try {
      fresh = await apiGet(`/api/visas/${v.id}`);
    } catch {
      // offline or transient error — fall back to the row we have
    }
    const message = buildMessage(fresh);
    const phone = String(fresh.phone ?? "").replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    if (win) win.location.href = url;
    else window.open(url, "_blank");
    patchStatus.mutate({ id: v.id, payload: { sendStatus: "تم الإرسال" } });
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold">تأشيرات أخرى</h1>
            <p className="text-sm text-muted-foreground mt-1">
              إدارة بيانات تأشيرات الزيارة والعمل والتأشيرات المتنوعة الأخرى.
            </p>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="w-4 h-4 ml-1" />
            إضافة تأشيرة جديدة
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
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-3 text-right font-medium">م</th>
                  <th className="px-3 py-3 text-right font-medium">العميل</th>
                  <th className="px-3 py-3 text-right font-medium">رقم الطلب</th>
                  <th className="px-3 py-3 text-right font-medium">الوكيل</th>
                  <th className="px-3 py-3 text-right font-medium">الإصدار</th>
                  <th className="px-3 py-3 text-right font-medium">نوع التأشيرة</th>
                  <th className="px-3 py-3 text-right font-medium">الشراء</th>
                  <th className="px-3 py-3 text-right font-medium">البيع</th>
                  <th className="px-3 py-3 text-right font-medium">مستلم (عميل)</th>
                  <th className="px-3 py-3 text-right font-medium">باقي (عميل)</th>
                  <th className="px-3 py-3 text-right font-medium">محول (وكيل)</th>
                  <th className="px-3 py-3 text-right font-medium">باقي (وكيل)</th>
                  <th className="px-3 py-3 text-right font-medium">الربح</th>
                  <th className="px-3 py-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={14} className="text-center py-8 text-muted-foreground">
                      جاري التحميل...
                    </td>
                  </tr>
                )}
                {!isLoading && visas.length === 0 && (
                  <tr>
                    <td colSpan={14} className="text-center py-12 text-muted-foreground">
                      <div className="font-medium">لا توجد تأشيرات</div>
                      <div className="text-xs mt-1">أضف أول تأشيرة بالضغط على زر «إضافة تأشيرة جديدة».</div>
                    </td>
                  </tr>
                )}
                {visas.map((v: Visa, idx: number) => (
                  <tr key={v.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 font-medium">
                        {v.clientName}
                        {v.sendStatus === "تم الإرسال" && (
                          <MessageCircle className="w-3.5 h-3.5 text-green-600" aria-label="تم إرسال تذكير" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {v.passportNumber} | {v.phone}
                      </div>
                    </td>
                    <td className="px-3 py-2" dir="ltr">{v.requestNumber}</td>
                    <td className="px-3 py-2">{v.agent}</td>
                    <td className="px-3 py-2">
                      <div>{formatDate(v.issueDate)}</div>
                      <div className="text-xs text-muted-foreground">{v.issuingAuthority}</div>
                    </td>
                    <td className="px-3 py-2">{v.visaType}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.purchasePrice)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.salePrice)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.receivedFromClient)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.clientBalance)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.transferredToAgent)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.agentBalance)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmt(v.profit)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          title="تعديل"
                          onClick={() => openEdit(v)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <a href={`/receipt/${v.id}?type=visa`} title="طباعة سند">
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-green-600"
                          title="رسالة واتساب"
                          onClick={() => handleWhatsApp(v)}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive"
                          title="حذف"
                          onClick={() => handleDelete(v.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
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
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل التأشيرة" : "إضافة تأشيرة جديدة"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2 overflow-visible">
              <Field label="اسم العميل" required value={form.clientName} onChange={(v) => setForm((f: any) => ({ ...f, clientName: v }))} error={errors.clientName} />
              <Field label="رقم الجواز" required ltr value={form.passportNumber} onChange={(v) => setForm((f: any) => ({ ...f, passportNumber: v }))} error={errors.passportNumber} />
              <Field label="رقم الطلب" required ltr value={form.requestNumber} onChange={(v) => setForm((f: any) => ({ ...f, requestNumber: v }))} error={errors.requestNumber} />
              <Field label="رقم الجوال" required ltr value={form.phone} onChange={(v) => setForm((f: any) => ({ ...f, phone: v }))} error={errors.phone} />
              <div className="space-y-1.5">
                <Label>الوكيل<span className="text-destructive mr-1">*</span></Label>
                <Input
                  list="agent-list-visa"
                  placeholder="اختر من الوكلاء أو اكتب اسماً"
                  value={form.agent}
                  onChange={(e) => setForm((f: any) => ({ ...f, agent: e.target.value }))}
                />
                <datalist id="agent-list-visa">
                  {(agentNames as string[]).map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                {errors.agent && <p className="text-xs text-destructive">{errors.agent}</p>}
              </div>
              <Field label="تاريخ الإصدار" required type="date" value={form.issueDate} onChange={(v) => setForm((f: any) => ({ ...f, issueDate: v }))} error={errors.issueDate} />
              <div className="space-y-1.5">
                <Label>نوع التأشيرة<span className="text-destructive mr-1">*</span></Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.visaType}
                  onChange={(e) => setForm((f: any) => ({ ...f, visaType: e.target.value }))}
                >
                  <option value="" disabled>اختر النوع</option>
                  {VISA_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.visaType && <p className="text-xs text-destructive">{errors.visaType}</p>}
              </div>
              <Field label="جهة الإصدار" required value={form.issuingAuthority} onChange={(v) => setForm((f: any) => ({ ...f, issuingAuthority: v }))} error={errors.issuingAuthority} />
              <Field label="ترحيل عبر (يظهر في السند)" placeholder="ترحيل عبر" value={form.transactionParty} onChange={(v) => setForm((f: any) => ({ ...f, transactionParty: v }))} />
              <Field label="سعر الشراء" required type="number" min={0} value={String(form.purchasePrice)} onChange={(v) => setForm((f: any) => ({ ...f, purchasePrice: v === "" ? "" : Number(v) }))} error={errors.purchasePrice} />
              <Field label="سعر البيع" required type="number" min={0} value={String(form.salePrice)} onChange={(v) => setForm((f: any) => ({ ...f, salePrice: v === "" ? "" : Number(v) }))} error={errors.salePrice} />
              <Field label="مستلم من العميل" required type="number" min={0} value={String(form.receivedFromClient)} onChange={(v) => setForm((f: any) => ({ ...f, receivedFromClient: v === "" ? "" : Number(v) }))} error={errors.receivedFromClient} />
              <Field label="محول للوكيل" required type="number" min={0} value={String(form.transferredToAgent)} onChange={(v) => setForm((f: any) => ({ ...f, transferredToAgent: v === "" ? "" : Number(v) }))} error={errors.transferredToAgent} />
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
