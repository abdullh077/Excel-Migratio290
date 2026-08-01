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
import { Users, TrendingUp, BarChart3, Plus, Loader2, FileText, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Exact currency formatter as production `nt`
function nt(e: number | null | undefined): string {
  return e == null
    ? "0 ر.س"
    : e.toLocaleString("ar-SA", {
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
    return t.toLocaleDateString("ar-SA", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return e;
  }
}

const AGENTS_KEY = ["statement-agents"];
const LEDGER_KEY = ["statement-ledger"];
const SUMMARY_KEY = ["statement-summary"];

const jsonHeaders = { "Content-Type": "application/json" };

// API helpers (exact endpoints/payloads)
const listAgents = () => fetch("/api/statement/agents", { credentials: "include" }).then(handle);
const createAgent = (body: any) =>
  fetch("/api/statement/agents", { method: "POST", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const updateAgent = (id: any, body: any) =>
  fetch(`/api/statement/agents/${id}`, { method: "PUT", credentials: "include", headers: jsonHeaders, body: JSON.stringify(body) }).then(handle);
const deleteAgent = (id: any) =>
  fetch(`/api/statement/agents/${id}`, { method: "DELETE", credentials: "include" }).then(handle);
const getAgent = (id: any) =>
  fetch(`/api/statement/agents/${id}`, { credentials: "include" }).then(handle);
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

async function handle(res: Response) {
  if (!res.ok) {
    const t = await res.json().catch(() => ({}));
    throw new Error(t?.message || t?.error || "حدث خطأ");
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
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

  const { data: agents, isLoading: agentsLoading } = useQuery({ queryKey: AGENTS_KEY, queryFn: listAgents });
  const { data: ledger, isLoading: ledgerLoading } = useQuery({ queryKey: LEDGER_KEY, queryFn: listLedger });
  const { data: summary, isLoading: summaryLoading } = useQuery({ queryKey: SUMMARY_KEY, queryFn: getSummary });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["statement-agent", selected],
    queryFn: () => getAgent(selected),
    enabled: selected != null,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: AGENTS_KEY });
    qc.invalidateQueries({ queryKey: LEDGER_KEY });
    qc.invalidateQueries({ queryKey: SUMMARY_KEY });
    if (selected != null) qc.invalidateQueries({ queryKey: ["statement-agent", selected] });
  };

  const onError = (e: any) =>
    toast({ variant: "destructive", title: "خطأ", description: e?.message || "حدث خطأ" });

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
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">كشف الحساب</h1>
            <p className="text-sm text-muted-foreground">حسابات الوكلاء، الدخل والنفقات، والملخص الشهري</p>
          </div>
        </div>

        <Tabs defaultValue="agents" dir="rtl">
          <TabsList className="mb-4">
            <TabsTrigger value="agents">
              <Users className="w-4 h-4 ml-1.5" /> الوكلاء
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
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                سجّل وكلاءك هنا، واختر اسم الوكيل عند إضافة أي معاملة ليظهر في كشفه.
              </p>
              <Button onClick={openNew}>
                <Plus className="w-4 h-4 ml-1.5" /> وكيل جديد
              </Button>
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

          {/* Ledger tab */}
          <TabsContent value="ledger" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3">
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
          <TabsContent value="summary">
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
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
