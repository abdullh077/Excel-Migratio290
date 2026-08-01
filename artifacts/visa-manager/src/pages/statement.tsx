import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Users, TrendingUp, BarChart3, Plus, Loader2, FileText, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, Wallet, Receipt, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PrintHeader, PrintWatermark } from "@/components/print/PrintHeader";

// Exact currency formatter as production `nt`
function nt(e: number | null | undefined): string {
  return e == null
    ? "0 ر.س"
    : e.toLocaleString("ar-SA-u-ca-gregory", {
        style: "currency",
        currency: "SAR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
}

// Exact date formatter as production `La`
function La(e: string | null | undefined): string {
  if (!e) return "-";
  try {
    const t = new Date(e);
    if (isNaN(t.getTime())) return e;
    return t.toLocaleDateString("ar-SA-u-ca-gregory", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return e;
  }
}

const AGENTS_KEY = ["statement-agents"];
const LEDGER_KEY = ["statement-ledger"];
const SUMMARY_KEY = ["statement-summary"];
const CLIENTS_KEY = ["statement-clients"];
const VOUCHERS_KEY = ["vouchers"];
const OFFICE_KEY = ["settings-office"];

const jsonHeaders = { "Content-Type": "application/json" };

// API helpers (exact endpoints/payloads)
const listAgents = () => fetch("/api/statement/agents", { credentials: "include" }).then(handle);
const createAgent = (body: any) =>
  fetch("/api/statement/agents", { method: "POST", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const updateAgent = (id: any, body: any) =>
  fetch(`/api/statement/agents/${id}`, { method: "PUT", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const deleteAgent = (id: any) =>
  fetch(`/api/statement/agents/${id}`, { method: "DELETE", credentials: "include" }).then(handle);
const getAgent = (id: any, from?: string, to?: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const s = qs.toString();
  return fetch(`/api/statement/agents/${id}${s ? `?${s}` : ""}`, { credentials: "include" }).then(handle);
};
const createPayment = (id: any, body: any) =>
  fetch(`/api/statement/agents/${id}/payments`, { method: "POST", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const deletePayment = (id: any) =>
  fetch(`/api/statement/payments/${id}`, { method: "DELETE", credentials: "include" }).then(handle);
const listLedger = () => fetch("/api/statement/ledger", { credentials: "include" }).then(handle);
const createLedger = (body: any) =>
  fetch("/api/statement/ledger", { method: "POST", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const deleteLedger = (id: any) =>
  fetch(`/api/statement/ledger/${id}`, { method: "DELETE", credentials: "include" }).then(handle);
const getSummary = () => fetch("/api/statement/summary", { credentials: "include" }).then(handle);
const listClients = () => fetch("/api/statement/clients", { credentials: "include" }).then(handle);
const getClientDetails = (name: string) =>
  fetch(`/api/statement/clients/details?name=${encodeURIComponent(name)}`, { credentials: "include" }).then(handle);
const listVouchers = () => fetch("/api/vouchers", { credentials: "include" }).then(handle);
const createVoucher = (body: any) =>
  fetch("/api/vouchers", { method: "POST", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const deleteVoucher = (id: any) =>
  fetch(`/api/vouchers/${id}`, { method: "DELETE", credentials: "include" }).then(handle);
const getOffice = () => fetch("/api/settings/office", { credentials: "include" }).then(handle);
const listAgentNames = () => fetch("/api/statement/agent-names", { credentials: "include" }).then(handle);

async function handle(res: Response) {
  if (!res.ok) {
    const t = await res.json().catch(() => ({}));
    throw new Error(t?.message || t?.error || "حدث خطأ");
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function ClientBalanceBadge({ balance }: { balance: number }) {
  if (balance > 0)
    return (
      <Badge variant="destructive" className="text-xs">
        عليه {nt(balance)}
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs">
      مسدَّد
    </Badge>
  );
}

function BalanceBadge({ balance }: { balance: number }) {
  if (balance > 0)
    return (
      <Badge variant="destructive" className="text-xs">
        عليه {nt(balance)}
      </Badge>
    );
  if (balance < 0)
    return (
      <Badge className="text-xs bg-emerald-600 hover:bg-emerald-600">
        له {nt(-balance)}
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs">
      مسدَّد
    </Badge>
  );
}

// Ledger-style detailed statement table (كشف حساب تفصيلي بنمط دفتر الأستاذ)
function LedgerTable({ ledger, compact }: { ledger: any; compact?: boolean }) {
  const opening = Number(ledger.opening) || 0;
  let run = opening;
  const rows = (ledger.entries ?? []).map((e: any) => {
    run += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    return { ...e, after: run };
  });
  const totalDebit = rows.reduce((s: number, r: any) => s + (Number(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s: number, r: any) => s + (Number(r.credit) || 0), 0);
  const final = opening + totalDebit - totalCredit;
  const navy = "hsl(220,40%,18%)";
  const gold = "hsl(43,65%,52%)";
  const money = (v: number) => (v ? nt(v) : "—");
  const balCell = (v: number) => (
    <span className={v > 0 ? "text-red-700 font-semibold" : v < 0 ? "text-emerald-700 font-semibold" : "font-semibold"}>
      {nt(Math.abs(v))}{v > 0 ? " (عليه)" : v < 0 ? " (له)" : ""}
    </span>
  );
  return (
    <div className={compact ? "overflow-x-auto" : "overflow-x-auto rounded-md border-2" } style={compact ? undefined : { borderColor: navy }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-white whitespace-nowrap" style={{ background: navy }}>
            {["المرجع", "نوع الحركة", "التاريخ", "البيان", "مدين (عليه)", "دائن (له)", "الرصيد بعد العملية"].map((h) => (
              <th key={h} className="px-3 py-2 text-right font-bold border" style={{ borderColor: gold }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="whitespace-nowrap bg-[hsl(43,65%,52%)]/10">
            <td className="px-3 py-2 border border-border">—</td>
            <td className="px-3 py-2 border border-border font-semibold">الرصيد الافتتاحي</td>
            <td className="px-3 py-2 border border-border">{ledger.from ? La(ledger.from) : "—"}</td>
            <td className="px-3 py-2 border border-border">رصيد ما قبل الفترة</td>
            <td className="px-3 py-2 border border-border">—</td>
            <td className="px-3 py-2 border border-border">—</td>
            <td className="px-3 py-2 border border-border">{balCell(opening)}</td>
          </tr>
          {rows.length ? (
            rows.map((r: any) => (
              <tr key={r.ref} className="whitespace-nowrap odd:bg-muted/20">
                <td className="px-3 py-2 border border-border font-mono text-xs">{r.ref}</td>
                <td className="px-3 py-2 border border-border">{r.kind}</td>
                <td className="px-3 py-2 border border-border">{La(r.date)}</td>
                <td className="px-3 py-2 border border-border whitespace-normal min-w-48">{r.description}</td>
                <td className="px-3 py-2 border border-border">{money(Number(r.debit))}</td>
                <td className="px-3 py-2 border border-border">{money(Number(r.credit))}</td>
                <td className="px-3 py-2 border border-border">{balCell(r.after)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground border border-border">
                لا توجد حركات خلال هذه الفترة
              </td>
            </tr>
          )}
          <tr className="whitespace-nowrap font-bold" style={{ background: "hsl(43,65%,52%,0.25)" }}>
            <td colSpan={4} className="px-3 py-2 border text-right" style={{ borderColor: navy }}>الإجمالي</td>
            <td className="px-3 py-2 border" style={{ borderColor: navy }}>{nt(totalDebit)}</td>
            <td className="px-3 py-2 border" style={{ borderColor: navy }}>{nt(totalCredit)}</td>
            <td className="px-3 py-2 border" style={{ borderColor: navy }}>
              <span className={`inline-block rounded px-3 py-0.5 text-white ${final > 0 ? "bg-red-700" : final < 0 ? "bg-emerald-700" : "bg-slate-600"}`}>
                {final > 0 ? "مدين" : final < 0 ? "دائن" : "مسدَّد"}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="px-3 py-2 text-center font-semibold border-t" style={{ borderColor: navy }}>
        {final > 0
          ? `عليكم مبلغ ${nt(final)}`
          : final < 0
            ? `لكم مبلغ ${nt(-final)}`
            : "الرصيد مسدَّد بالكامل — لا مستحقات"}
        {" "}— العملة: ريال سعودي
      </div>
    </div>
  );
}

function EmptyRow({
  colSpan,
  icon: Icon,
  title,
  hint,
}: {
  colSpan: number;
  icon: any;
  title: string;
  hint?: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-44 text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-3 ring-1 ring-border">
            <Icon className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="font-semibold text-foreground/80">{title}</p>
          {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function StatementPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // dialog + form state
  const [agentDialog, setAgentDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [nameField, setNameField] = useState("");
  const [phoneField, setPhoneField] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDirection, setPayDirection] = useState("from_agent");
  const [payNotes, setPayNotes] = useState("");
  const [ledgerType, setLedgerType] = useState("expense");
  const [ledgerAmount, setLedgerAmount] = useState("");
  const [ledgerDesc, setLedgerDesc] = useState("");

  // clients tab
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientDialog, setClientDialog] = useState(false);
  const [clientNameField, setClientNameField] = useState("");
  const [clientPhoneField, setClientPhoneField] = useState("");

  // vouchers tab
  const [voucherDialog, setVoucherDialog] = useState(false);
  const [voucherKind, setVoucherKind] = useState<"receipt" | "payment">("receipt");
  const [vParty, setVParty] = useState("");
  const [vAmount, setVAmount] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vDate, setVDate] = useState(todayISO());
  const [vAgent, setVAgent] = useState<string>("");
  const [printVoucher, setPrintVoucher] = useState<any>(null);
  const [stmtFrom, setStmtFrom] = useState("");
  const [stmtTo, setStmtTo] = useState("");
  const [printStatement, setPrintStatement] = useState(false);

  const { data: agents, isLoading: agentsLoading } = useQuery({ queryKey: AGENTS_KEY, queryFn: listAgents });
  const { data: ledger, isLoading: ledgerLoading } = useQuery({ queryKey: LEDGER_KEY, queryFn: listLedger });
  const { data: summary, isLoading: summaryLoading } = useQuery({ queryKey: SUMMARY_KEY, queryFn: getSummary });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["statement-agent", selected, stmtFrom, stmtTo],
    queryFn: () => getAgent(selected, stmtFrom, stmtTo),
    enabled: selected != null,
  });
  const { data: clients, isLoading: clientsLoading } = useQuery({ queryKey: CLIENTS_KEY, queryFn: listClients });
  const { data: clientDetail, isLoading: clientDetailLoading } = useQuery({
    queryKey: ["statement-client", selectedClient],
    queryFn: () => getClientDetails(selectedClient!),
    enabled: selectedClient != null,
  });
  const { data: vouchers, isLoading: vouchersLoading } = useQuery({ queryKey: VOUCHERS_KEY, queryFn: listVouchers });
  const { data: office } = useQuery({ queryKey: OFFICE_KEY, queryFn: getOffice });
  const { data: agentNames } = useQuery({ queryKey: ["agent-names"], queryFn: listAgentNames });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: AGENTS_KEY });
    qc.invalidateQueries({ queryKey: LEDGER_KEY });
    qc.invalidateQueries({ queryKey: SUMMARY_KEY });
    if (selected != null) qc.invalidateQueries({ queryKey: ["statement-agent", selected] });
  };

  const onError = (e: any) =>
    toast({ variant: "destructive", title: "خطأ", description: e?.message || "حدث خطأ" });

  const addClient = useMutation({
    mutationFn: () =>
      fetch("/api/statement/clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: clientNameField.trim(), phone: clientPhoneField.trim() || null }),
      }).then(handle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      setClientDialog(false);
      setClientNameField("");
      setClientPhoneField("");
      toast({ title: "تم إضافة حساب العميل" });
    },
    onError,
  });

  const saveAgent = useMutation({
    mutationFn: () =>
      editing
        ? updateAgent(editing.id, { name: nameField.trim(), phone: phoneField.trim() })
        : createAgent({ name: nameField.trim(), phone: phoneField.trim() || undefined }),
    onSuccess: () => {
      invalidateAll();
      setAgentDialog(false);
      setEditing(null);
      setNameField("");
      setPhoneField("");
      toast({ title: editing ? "تم تعديل الوكيل" : "تم إضافة الوكيل" });
    },
    onError,
  });

  const delAgent = useMutation({
    mutationFn: (id: any) => deleteAgent(id),
    onSuccess: () => {
      invalidateAll();
      setDeleteTarget(null);
      toast({ title: "تم حذف الوكيل" });
    },
    onError: (e: any) => {
      setDeleteTarget(null);
      onError(e);
    },
  });

  const addPayment = useMutation({
    mutationFn: () =>
      createPayment(selected, {
        amount: Number(payAmount),
        direction: payDirection,
        notes: payNotes.trim() || undefined,
      }),
    onSuccess: () => {
      invalidateAll();
      setPayAmount("");
      setPayNotes("");
      toast({ title: "تم تسجيل الدفعة" });
    },
    onError,
  });

  const delPayment = useMutation({
    mutationFn: (id: any) => deletePayment(id),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "تم حذف الدفعة" });
    },
    onError,
  });

  const addLedger = useMutation({
    mutationFn: () =>
      createLedger({ type: ledgerType, amount: Number(ledgerAmount), description: ledgerDesc.trim() }),
    onSuccess: () => {
      invalidateAll();
      setLedgerAmount("");
      setLedgerDesc("");
      toast({ title: "تم تسجيل القيد" });
    },
    onError,
  });

  const delLedger = useMutation({
    mutationFn: (id: any) => deleteLedger(id),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "تم حذف القيد" });
    },
    onError,
  });

  const addVoucher = useMutation({
    mutationFn: () =>
      createVoucher({
        kind: voucherKind,
        partyType: vAgent && vParty.trim() === vAgent ? "agent" : "other",
        partyName: vParty.trim(),
        amount: Number(vAmount),
        description: vDesc.trim() || undefined,
        voucherDate: vDate ? new Date(vDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VOUCHERS_KEY });
      setVoucherDialog(false);
      setVParty("");
      setVAmount("");
      setVDesc("");
      setVDate(todayISO());
      setVAgent("");
      toast({ title: voucherKind === "receipt" ? "تم إنشاء سند القبض" : "تم إنشاء سند الصرف" });
    },
    onError,
  });

  const delVoucher = useMutation({
    mutationFn: (id: any) => deleteVoucher(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VOUCHERS_KEY });
      toast({ title: "تم حذف السند" });
    },
    onError,
  });

  const openVoucher = (kind: "receipt" | "payment") => {
    setVoucherKind(kind);
    setVParty("");
    setVAmount("");
    setVDesc("");
    setVDate(todayISO());
    setVAgent("");
    setVoucherDialog(true);
  };

  const partyOptions: string[] = [
    ...((agentNames as string[] | undefined) ?? []),
    ...((clients as any[] | undefined)?.map((c) => c.clientName) ?? []),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const openNew = () => {
    setEditing(null);
    setNameField("");
    setPhoneField("");
    setAgentDialog(true);
  };
  const openEdit = (a: any) => {
    setEditing(a);
    setNameField(a.name);
    setPhoneField(a.phone ?? "");
    setAgentDialog(true);
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 md:p-8 space-y-6" dir="rtl">
        <div className="flex items-center gap-3 no-print">
          <BarChart3 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">كشف الحساب</h1>
            <p className="text-sm text-muted-foreground">حسابات الوكلاء، حسابات العملاء، السندات، الدخل والنفقات، والملخص الشهري</p>
          </div>
        </div>

        {/* Print-only statement header — unified office header */}
        <div className="hidden print:block mb-4">
          <PrintHeader office={office} details={[{ label: "التاريخ", value: La(todayISO()) }]} />
          <p className="text-lg font-bold text-center mt-3 text-[hsl(220,40%,18%)]">كشف الحساب</p>
        </div>

        <Tabs defaultValue="agents" dir="rtl">
          <TabsList className="mb-4 no-print flex-wrap h-auto">
            <TabsTrigger value="agents">
              <Users className="w-4 h-4 ml-1.5" /> الوكلاء
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Wallet className="w-4 h-4 ml-1.5" /> حساب العملاء
            </TabsTrigger>
            <TabsTrigger value="vouchers">
              <Receipt className="w-4 h-4 ml-1.5" /> السندات
            </TabsTrigger>
            <TabsTrigger value="ledger">
              <TrendingUp className="w-4 h-4 ml-1.5" /> الدخل والنفقات
            </TabsTrigger>
            <TabsTrigger value="summary">
              <BarChart3 className="w-4 h-4 ml-1.5" /> الملخص الشهري
            </TabsTrigger>
          </TabsList>

          {/* Agents tab */}
          <TabsContent value="agents" className="space-y-4">
            <div className="flex items-center justify-between no-print">
              <p className="text-sm text-muted-foreground">
                سجّل وكلاءك هنا، واختر اسم الوكيل عند إضافة أي معاملة ليظهر في كشفه.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 ml-1.5" /> طباعة / PDF
                </Button>
                <Button onClick={openNew}>
                  <Plus className="w-4 h-4 ml-1.5" /> وكيل جديد
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="whitespace-nowrap">
                    <TableHead className="text-right">الوكيل</TableHead>
                    <TableHead className="text-right">الهاتف</TableHead>
                    <TableHead className="text-right">المعاملات</TableHead>
                    <TableHead className="text-right">إجمالي البيع</TableHead>
                    <TableHead className="text-right">الربح</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : agents?.length ? (
                    agents.map((ie: any) => (
                      <TableRow key={ie.id} className="whitespace-nowrap hover:bg-muted/30">
                        <TableCell className="font-medium">{ie.name}</TableCell>
                        <TableCell>{ie.phone || "-"}</TableCell>
                        <TableCell>{ie.transactions}</TableCell>
                        <TableCell>{nt(ie.totalSales)}</TableCell>
                        <TableCell className="text-emerald-600 font-medium">{nt(ie.profit)}</TableCell>
                        <TableCell>
                          <BalanceBadge balance={ie.balance} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => setSelected(ie.id)}>
                              <FileText className="w-4 h-4 ml-1" /> كشف الحساب
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(ie)} aria-label="تعديل">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(ie)}
                              aria-label="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={7} icon={Users} title="لا يوجد وكلاء بعد" hint="أضف وكيلاً لبدء تتبع حساباته" />
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Clients tab */}
          <TabsContent value="clients" className="space-y-4">
            <div className="flex items-center justify-between no-print gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                كشوف حسابات العملاء تُبنى تلقائياً من التأشيرات، وتقدر تضيف حساب عميل يدوياً. اضغط على أي عميل لعرض التفاصيل.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => { setClientNameField(""); setClientPhoneField(""); setClientDialog(true); }}>
                  <Plus className="w-4 h-4 ml-1.5" /> إضافة حساب عميل
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 ml-1.5" /> طباعة / PDF
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="whitespace-nowrap">
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">الهاتف</TableHead>
                    <TableHead className="text-right">المعاملات</TableHead>
                    <TableHead className="text-right">إجمالي البيع</TableHead>
                    <TableHead className="text-right">المقبوض</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : clients?.length ? (
                    clients.map((c: any) => (
                      <TableRow
                        key={c.clientName}
                        className="whitespace-nowrap hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedClient(c.clientName)}
                      >
                        <TableCell className="font-medium">{c.clientName}</TableCell>
                        <TableCell>{c.phone || "-"}</TableCell>
                        <TableCell>{c.txCount}</TableCell>
                        <TableCell>{nt(c.totalSales)}</TableCell>
                        <TableCell className="text-emerald-600 font-medium">{nt(c.totalReceived)}</TableCell>
                        <TableCell>
                          <ClientBalanceBadge balance={c.balance} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={6} icon={Wallet} title="لا يوجد عملاء بعد" hint="تظهر حسابات العملاء تلقائياً عند إضافة التأشيرات" />
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

            {/* Add client dialog */}
            <Dialog open={clientDialog} onOpenChange={setClientDialog}>
              <DialogContent dir="rtl">
                <DialogHeader><DialogTitle>إضافة حساب عميل</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">اسم العميل</label>
                    <Input value={clientNameField} onChange={(e) => setClientNameField(e.target.value)} placeholder="اسم العميل" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">رقم الهاتف (اختياري)</label>
                    <Input value={clientPhoneField} onChange={(e) => setClientPhoneField(e.target.value)} dir="ltr" className="text-left" placeholder="7xxxxxxxx" />
                  </div>
                  <p className="text-xs text-muted-foreground">أي تأشيرات بنفس اسم العميل ستظهر في حسابه تلقائياً.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setClientDialog(false)}>إلغاء</Button>
                  <Button onClick={() => addClient.mutate()} disabled={addClient.isPending || !clientNameField.trim()}>إضافة</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          {/* Vouchers tab */}
          <TabsContent value="vouchers" className="space-y-4">
            <div className="flex items-center justify-between no-print">
              <p className="text-sm text-muted-foreground">
                أنشئ سندات القبض والصرف النقدية للوكلاء والعملاء والجهات الأخرى.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 ml-1.5" /> طباعة / PDF
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openVoucher("receipt")}>
                  <ArrowUpCircle className="w-4 h-4 ml-1.5" /> سند قبض
                </Button>
                <Button variant="destructive" onClick={() => openVoucher("payment")}>
                  <ArrowDownCircle className="w-4 h-4 ml-1.5" /> سند صرف
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="whitespace-nowrap">
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الطرف</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right no-print">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchersLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : vouchers?.length ? (
                    vouchers.map((v: any) => (
                      <TableRow key={v.id} className="whitespace-nowrap hover:bg-muted/30">
                        <TableCell>{La(v.voucherDate)}</TableCell>
                        <TableCell>
                          {v.kind === "receipt" ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                              <ArrowUpCircle className="w-3 h-3 ml-1" /> سند قبض
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <ArrowDownCircle className="w-3 h-3 ml-1" /> سند صرف
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{v.partyName}</TableCell>
                        <TableCell className="font-medium">{nt(Number(v.amount))}</TableCell>
                        <TableCell>{v.description || "-"}</TableCell>
                        <TableCell className="no-print">
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => setPrintVoucher(v)}>
                              <Printer className="w-4 h-4 ml-1" /> طباعة
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => delVoucher.mutate(v.id)}
                              aria-label="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={6} icon={Receipt} title="لا توجد سندات بعد" hint="أنشئ سند قبض أو سند صرف لتظهر هنا" />
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Ledger tab */}
          <TabsContent value="ledger" className="space-y-4">
            <div className="flex justify-end no-print">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 ml-1.5" /> طباعة / PDF
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3 no-print">
              <div>
                <p className="text-sm mb-1.5 font-medium">النوع</p>
                <Select value={ledgerType} onValueChange={(v) => setLedgerType(v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">نفقة</SelectItem>
                    <SelectItem value="income">دخل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-sm mb-1.5 font-medium">المبلغ</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="w-32"
                  value={ledgerAmount}
                  onChange={(e) => setLedgerAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex-1 min-w-48">
                <p className="text-sm mb-1.5 font-medium">الوصف</p>
                <Input
                  value={ledgerDesc}
                  onChange={(e) => setLedgerDesc(e.target.value)}
                  placeholder="مثال: إيجار المكتب، رواتب، دخل خدمات..."
                />
              </div>
              <Button
                disabled={!Number(ledgerAmount) || !ledgerDesc.trim() || addLedger.isPending}
                onClick={() => addLedger.mutate()}
              >
                <Plus className="w-4 h-4 ml-1.5" /> تسجيل
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="whitespace-nowrap">
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : ledger?.length ? (
                    ledger.map((ie: any) => (
                      <TableRow key={ie.id} className="whitespace-nowrap hover:bg-muted/30">
                        <TableCell>{La(ie.entryDate)}</TableCell>
                        <TableCell>
                          {ie.type === "income" ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                              <ArrowUpCircle className="w-3 h-3 ml-1" /> دخل
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <ArrowDownCircle className="w-3 h-3 ml-1" /> نفقة
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{ie.description}</TableCell>
                        <TableCell className="font-medium">{nt(Number(ie.amount))}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => delLedger.mutate(ie.id)}
                            aria-label="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={5} icon={TrendingUp} title="لا توجد قيود بعد" hint="سجّل النفقات والدخل العام للمكتب هنا" />
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Summary tab */}
          <TabsContent value="summary" className="space-y-4">
            <div className="flex justify-end no-print">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 ml-1.5" /> طباعة / PDF
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="whitespace-nowrap">
                    <TableHead className="text-right">الشهر</TableHead>
                    <TableHead className="text-right">عدد المعاملات</TableHead>
                    <TableHead className="text-right">مبيعات المعاملات</TableHead>
                    <TableHead className="text-right">ربح المعاملات</TableHead>
                    <TableHead className="text-right">دخل آخر</TableHead>
                    <TableHead className="text-right">النفقات</TableHead>
                    <TableHead className="text-right">الصافي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : summary?.length ? (
                    summary.map((ie: any) => (
                      <TableRow key={ie.month} className="whitespace-nowrap hover:bg-muted/30">
                        <TableCell className="font-medium">{ie.month}</TableCell>
                        <TableCell>{ie.txCount}</TableCell>
                        <TableCell>{nt(ie.txSales)}</TableCell>
                        <TableCell className="text-emerald-600">{nt(ie.txProfit)}</TableCell>
                        <TableCell>{nt(ie.otherIncome)}</TableCell>
                        <TableCell className="text-destructive">{nt(ie.expenses)}</TableCell>
                        <TableCell className={`font-bold ${ie.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {nt(ie.net)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={7} icon={BarChart3} title="لا توجد بيانات بعد" hint="الملخص يُبنى تلقائياً من معاملاتك وقيودك" />
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add/Edit agent dialog */}
        <Dialog
          open={agentDialog}
          onOpenChange={(o) => {
            if (!o) setAgentDialog(false);
          }}
        >
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editing ? `تعديل الوكيل — ${editing.name}` : "وكيل جديد"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="text-sm mb-1.5 font-medium">اسم الوكيل</p>
                <Input value={nameField} onChange={(e) => setNameField(e.target.value)} placeholder="مثال: وكيل صنعاء" />
              </div>
              <div>
                <p className="text-sm mb-1.5 font-medium">الهاتف (اختياري)</p>
                <Input value={phoneField} onChange={(e) => setPhoneField(e.target.value)} placeholder="7xxxxxxxx" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAgentDialog(false)}>
                إلغاء
              </Button>
              <Button disabled={nameField.trim().length < 2 || saveAgent.isPending} onClick={() => saveAgent.mutate()}>
                {saveAgent.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />} حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete agent dialog */}
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
        >
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>حذف الوكيل — {deleteTarget?.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              سيُحذف الوكيل ودفعاته من كشف الحساب. معاملاته السابقة تبقى محفوظة باسمه.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                disabled={delAgent.isPending}
                onClick={() => deleteTarget && delAgent.mutate(deleteTarget.id)}
              >
                حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agent detail dialog */}
        <Dialog
          open={selected != null}
          onOpenChange={(o) => {
            if (!o) {
              setSelected(null);
              setPayAmount("");
              setPayNotes("");
              setStmtFrom("");
              setStmtTo("");
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> كشف حساب — {detail?.agent?.name ?? ""}
              </DialogTitle>
            </DialogHeader>
            {detailLoading || !detail ? (
              <div className="py-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">المعاملات</p>
                    <p className="font-bold text-lg">{detail.totals.count}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">إجمالي البيع</p>
                    <p className="font-bold text-lg">{nt(detail.totals.totalSales)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">قبضنا منه</p>
                    <p className="font-bold text-lg">{nt(detail.totals.paidFrom)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">الرصيد</p>
                    <BalanceBadge balance={detail.totals.balance} />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-wrap items-end gap-2">
                  <div>
                    <p className="text-xs mb-1 font-medium">الاتجاه</p>
                    <Select value={payDirection} onValueChange={(v) => setPayDirection(v)}>
                      <SelectTrigger className="w-36 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="from_agent">قبضنا من الوكيل</SelectItem>
                        <SelectItem value="to_agent">دفعنا للوكيل</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs mb-1 font-medium">المبلغ</p>
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="w-28 h-9"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1 min-w-32">
                    <p className="text-xs mb-1 font-medium">ملاحظة (اختياري)</p>
                    <Input className="h-9" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                  </div>
                  <Button size="sm" disabled={!Number(payAmount) || addPayment.isPending} onClick={() => addPayment.mutate()}>
                    <Plus className="w-4 h-4 ml-1" /> تسجيل دفعة
                  </Button>
                </div>

                {detail.payments.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2">الدفعات</p>
                    <div className="rounded-lg border border-border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="whitespace-nowrap">
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">الاتجاه</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">ملاحظة</TableHead>
                            <TableHead className="text-right"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.payments.map((ie: any) => (
                            <TableRow key={ie.id} className="whitespace-nowrap">
                              <TableCell>{La(ie.paidAt)}</TableCell>
                              <TableCell>{ie.direction === "from_agent" ? "قبضنا منه" : "دفعنا له"}</TableCell>
                              <TableCell className="font-medium">{nt(Number(ie.amount))}</TableCell>
                              <TableCell>{ie.notes || "-"}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  onClick={() => delPayment.mutate(ie.id)}
                                  aria-label="حذف"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-semibold mb-2">المعاملات ({detail.totals.count})</p>
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="whitespace-nowrap">
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-right">البيع</TableHead>
                          <TableHead className="text-right">الشراء</TableHead>
                          <TableHead className="text-right">الربح</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.transactions.length ? (
                          detail.transactions.map((ie: any) => (
                            <TableRow key={`${ie.kind}-${ie.id}`} className="whitespace-nowrap">
                              <TableCell>{La(ie.date)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {ie.kind === "umrah" ? "عمرة" : "تأشيرة"}
                                </Badge>
                              </TableCell>
                              <TableCell>{ie.clientName}</TableCell>
                              <TableCell>{nt(ie.sale)}</TableCell>
                              <TableCell>{nt(ie.purchase)}</TableCell>
                              <TableCell className="text-emerald-600 font-medium">{nt(ie.sale - ie.purchase)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <EmptyRow
                            colSpan={6}
                            icon={Users}
                            title="لا توجد معاملات لهذا الوكيل"
                            hint="اختر اسمه في حقل الوكيل عند إضافة معاملة"
                          />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Detailed ledger statement (كشف حساب تفصيلي) */}
                <div className="rounded-xl border-2 border-[hsl(43,65%,52%)]/60 overflow-hidden">
                  <div className="bg-[hsl(220,40%,18%)] text-white px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[hsl(43,65%,60%)]" /> كشف الحساب التفصيلي
                    </p>
                    <Button
                      size="sm"
                      className="bg-[hsl(43,65%,52%)] hover:bg-[hsl(43,65%,45%)] text-[hsl(220,40%,12%)] font-bold"
                      onClick={() => setPrintStatement(true)}
                    >
                      <Printer className="w-4 h-4 ml-1.5" /> معاينة وطباعة الكشف
                    </Button>
                  </div>
                  <div className="p-3 bg-muted/30 flex flex-wrap items-end gap-3 border-b border-border">
                    <div>
                      <p className="text-xs mb-1 font-medium">من تاريخ</p>
                      <Input type="date" className="h-9 w-40" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)} />
                    </div>
                    <div>
                      <p className="text-xs mb-1 font-medium">إلى تاريخ</p>
                      <Input type="date" className="h-9 w-40" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)} />
                    </div>
                    {(stmtFrom || stmtTo) && (
                      <Button variant="ghost" size="sm" onClick={() => { setStmtFrom(""); setStmtTo(""); }}>
                        عرض كل الفترات
                      </Button>
                    )}
                  </div>
                  {detail.ledger && (
                    <LedgerTable ledger={detail.ledger} compact />
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Print agent statement dialog */}
        <Dialog open={printStatement} onOpenChange={(o) => { if (!o) setPrintStatement(false); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader className="no-print">
              <DialogTitle>كشف حساب تفصيلي — {detail?.agent?.name ?? ""}</DialogTitle>
            </DialogHeader>
            {detail?.ledger && (
              <div className="voucher-print relative overflow-hidden p-4 rounded-lg border-2 border-[hsl(220,40%,18%)] bg-white text-black">
                <PrintWatermark logo={office?.officeLogo} />
                <div className="relative space-y-4">
                  <PrintHeader
                    office={office}
                    details={[
                      { label: "التاريخ", value: La(todayISO()) },
                      { label: "العملة", value: "ريال سعودي" },
                    ]}
                  />
                  {/* Statement title band */}
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 rounded-md bg-[hsl(220,40%,18%)] text-white px-4 py-2 text-center font-bold border-2 border-[hsl(43,65%,52%)]">
                      كشف حساب تفصيلي للوكيل: <span className="text-[hsl(43,70%,65%)]">{detail.agent.name}</span>
                    </div>
                    <div className="rounded-md border-2 border-[hsl(220,40%,18%)] px-4 py-2 text-center text-sm font-semibold flex items-center">
                      {stmtFrom || stmtTo
                        ? `خلال الفترة من ${stmtFrom ? La(stmtFrom) : "البداية"} إلى ${stmtTo ? La(stmtTo) : "اليوم"}`
                        : "عن كامل الفترة حتى تاريخه"}
                    </div>
                  </div>
                  <LedgerTable ledger={detail.ledger} />
                  {/* Signature & stamp */}
                  <div className="flex justify-between pt-4 text-sm">
                    <div className="text-center">
                      <p className="text-[hsl(220,40%,18%)] font-medium">توقيع الوكيل</p>
                      <p className="mt-8 border-t border-[hsl(220,40%,18%)] w-32">&nbsp;</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-end justify-center gap-2 h-16 mb-1">
                        {office?.signatureImage && (
                          <img src={office.signatureImage} alt="توقيع المكتب" className="max-h-[60px] w-auto object-contain" />
                        )}
                        {office?.stampImage && (
                          <img src={office.stampImage} alt="ختم المكتب" className="max-h-[64px] w-auto object-contain" />
                        )}
                      </div>
                      <p className="border-t border-[hsl(220,40%,18%)] pt-1 text-[hsl(220,40%,18%)] font-medium w-32">توقيع المكتب</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 no-print">
              <Button variant="outline" onClick={() => setPrintStatement(false)}>
                إغلاق
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4 ml-1.5" /> طباعة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Client detail dialog */}
        <Dialog
          open={selectedClient != null}
          onOpenChange={(o) => {
            if (!o) setSelectedClient(null);
          }}
        >
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" /> كشف حساب — {selectedClient ?? ""}
              </DialogTitle>
            </DialogHeader>
            {clientDetailLoading || !clientDetail ? (
              <div className="py-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">المعاملات</p>
                    <p className="font-bold text-lg">{clientDetail.account.txCount}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">إجمالي البيع</p>
                    <p className="font-bold text-lg">{nt(clientDetail.account.totalSales)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">المقبوض</p>
                    <p className="font-bold text-lg text-emerald-600">{nt(clientDetail.account.totalReceived)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">الرصيد</p>
                    <ClientBalanceBadge balance={clientDetail.account.balance} />
                  </div>
                </div>

                <div>
                  <p className="font-semibold mb-2">المعاملات ({clientDetail.account.txCount})</p>
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="whitespace-nowrap">
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">البيع</TableHead>
                          <TableHead className="text-right">المقبوض</TableHead>
                          <TableHead className="text-right">المتبقي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientDetail.transactions.length ? (
                          clientDetail.transactions.map((t: any) => (
                            <TableRow key={t.id} className="whitespace-nowrap">
                              <TableCell>{La(t.issueDate)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{t.type}</Badge>
                              </TableCell>
                              <TableCell>{nt(t.salePrice)}</TableCell>
                              <TableCell className="text-emerald-600">{nt(t.receivedFromClient)}</TableCell>
                              <TableCell className="font-medium">{nt(t.salePrice - t.receivedFromClient)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <EmptyRow colSpan={5} icon={Wallet} title="لا توجد معاملات" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create voucher dialog */}
        <Dialog
          open={voucherDialog}
          onOpenChange={(o) => {
            if (!o) setVoucherDialog(false);
          }}
        >
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {voucherKind === "receipt" ? (
                  <>
                    <ArrowUpCircle className="w-5 h-5 text-emerald-600" /> سند قبض
                  </>
                ) : (
                  <>
                    <ArrowDownCircle className="w-5 h-5 text-destructive" /> سند صرف
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="text-sm mb-1.5 font-medium">ربط بحساب وكيل (اختياري)</p>
                <Select
                  value={vAgent || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setVAgent("");
                    } else {
                      setVAgent(v);
                      setVParty(v);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون ربط" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط</SelectItem>
                    {((agents as any[] | undefined) ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">عند الربط سيظهر السند في كشف حساب الوكيل</p>
              </div>
              <div>
                <p className="text-sm mb-1.5 font-medium">اسم الطرف</p>
                <Input
                  list="voucher-party-list"
                  value={vParty}
                  onChange={(e) => {
                    setVParty(e.target.value);
                    if (vAgent && e.target.value.trim() !== vAgent) setVAgent("");
                  }}
                  placeholder="اسم الوكيل أو العميل أو الجهة"
                />
                <datalist id="voucher-party-list">
                  {partyOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <p className="text-sm mb-1.5 font-medium">المبلغ</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={vAmount}
                  onChange={(e) => setVAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <p className="text-sm mb-1.5 font-medium">البيان</p>
                <Input value={vDesc} onChange={(e) => setVDesc(e.target.value)} placeholder="سبب القبض / الصرف" />
              </div>
              <div>
                <p className="text-sm mb-1.5 font-medium">التاريخ</p>
                <Input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setVoucherDialog(false)}>
                إلغاء
              </Button>
              <Button
                disabled={!vParty.trim() || !Number(vAmount) || addVoucher.isPending}
                onClick={() => addVoucher.mutate()}
              >
                {addVoucher.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />} حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print voucher dialog */}
        <Dialog
          open={printVoucher != null}
          onOpenChange={(o) => {
            if (!o) setPrintVoucher(null);
          }}
        >
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader className="no-print">
              <DialogTitle>
                {printVoucher?.kind === "receipt" ? "سند قبض نقدية" : "سند صرف نقدية"}
              </DialogTitle>
            </DialogHeader>
            {printVoucher && (
              <div className="voucher-print relative overflow-hidden space-y-5 p-4 rounded-lg border-2 border-[hsl(220,40%,18%)] bg-white">
                {/* Watermark — office logo */}
                <PrintWatermark logo={office?.officeLogo} />
                <div className="relative space-y-5">
                {/* Office header — unified across all printable documents */}
                <PrintHeader
                  office={office}
                  details={[
                    { label: "رقم السند", value: String(printVoucher.id) },
                    { label: "التاريخ", value: La(printVoucher.voucherDate) },
                  ]}
                />

                <div className="text-center">
                  <p className="inline-block rounded-md bg-[hsl(220,40%,18%)] text-white px-6 py-1.5 text-lg font-bold border-2 border-[hsl(43,65%,52%)]">
                    {printVoucher.kind === "receipt" ? "سند قبض نقدية" : "سند صرف نقدية"}
                  </p>
                </div>

                <div className="text-sm">
                  <span className="font-semibold text-[hsl(220,40%,18%)]">
                    {printVoucher.kind === "receipt" ? "استلمنا من الأخ: " : "صرفنا للأخ: "}
                  </span>
                  {printVoucher.partyName}
                  {printVoucher.partyType === "agent" && (
                    <span className="mr-2 text-xs text-[hsl(43,50%,40%)]">(وكيل)</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[hsl(220,40%,18%)]">المبلغ:</span>
                  <span className="border-2 border-[hsl(43,65%,52%)] bg-[hsl(43,65%,52%)]/10 text-[hsl(220,40%,18%)] rounded px-4 py-2 font-bold text-lg">
                    {nt(Number(printVoucher.amount))}
                  </span>
                </div>

                {printVoucher.description && (
                  <div className="text-sm">
                    <span className="font-semibold text-[hsl(220,40%,18%)]">وذلك عن: </span>
                    {printVoucher.description}
                  </div>
                )}

                <div className="flex justify-between pt-6 text-sm">
                  <div className="text-center">
                    <p className="text-[hsl(220,40%,18%)] font-medium">توقيع المستلم</p>
                    <p className="mt-8 border-t border-[hsl(220,40%,18%)] w-32">&nbsp;</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-end justify-center gap-2 h-16 mb-1">
                      {office?.signatureImage && (
                        <img src={office.signatureImage} alt="توقيع المكتب" className="max-h-[60px] w-auto object-contain" />
                      )}
                      {office?.stampImage && (
                        <img src={office.stampImage} alt="ختم المكتب" className="max-h-[64px] w-auto object-contain" />
                      )}
                    </div>
                    <p className="border-t border-[hsl(220,40%,18%)] pt-1 text-[hsl(220,40%,18%)] font-medium w-32">توقيع المكتب</p>
                  </div>
                </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 no-print">
              <Button variant="outline" onClick={() => setPrintVoucher(null)}>
                إغلاق
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4 ml-1.5" /> طباعة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
