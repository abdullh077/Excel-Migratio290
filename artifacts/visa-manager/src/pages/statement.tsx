import { useState } from "react";
import { useListAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, useGetAgentDetails, useCreateAgentPayment, useDeleteAgentPayment, useListClientAccounts, useGetClientDetails, useListLedger, useCreateLedgerEntry, useDeleteLedgerEntry, useGetStatementSummary, useGetMe, getListAgentsQueryKey, getListLedgerQueryKey, getGetAgentDetailsQueryKey, getGetClientDetailsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, ChevronLeft, Printer } from "lucide-react";
import { fmt, formatDate, today } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function StatementPage() {
  const { data: me } = useGetMe();
  const role = me?.role ?? "sub";
  if (role === "sub") return <AppLayout><div className="p-6 text-center text-muted-foreground">غير مخول بالوصول لهذه الصفحة</div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <h1 className="text-xl font-bold mb-6">كشف الحساب</h1>
        <Tabs defaultValue="agents">
          <TabsList className="mb-6">
            <TabsTrigger value="agents">الوكلاء</TabsTrigger>
            <TabsTrigger value="clients">العملاء</TabsTrigger>
            <TabsTrigger value="ledger">الدفتر العام</TabsTrigger>
          </TabsList>
          <TabsContent value="agents"><AgentsTab /></TabsContent>
          <TabsContent value="clients"><ClientsTab /></TabsContent>
          <TabsContent value="ledger"><LedgerTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function AgentsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: agents = [] } = useListAgents();
  const [selected, setSelected] = useState<number | null>(null);
  const [agentDialog, setAgentDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [agentForm, setAgentForm] = useState({ name: "", phone: "", notes: "" });
  const [payDialog, setPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, direction: "from_agent", paidAt: today(), notes: "", createVoucher: false });
  const [deleteAgent, setDeleteAgent] = useState<number | null>(null);
  const [deletePay, setDeletePay] = useState<number | null>(null);

  const { data: details } = useGetAgentDetails(selected ?? 0, { query: { enabled: !!selected, queryKey: getGetAgentDetailsQueryKey(selected ?? 0) } });

  const createAgent = useCreateAgent({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAgentsQueryKey() }); setAgentDialog(false); toast({ title: "تم إضافة الوكيل" }); } } });
  const updateAgent = useUpdateAgent({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAgentsQueryKey() }); if (selected) qc.invalidateQueries({ queryKey: getGetAgentDetailsQueryKey(selected) }); setAgentDialog(false); toast({ title: "تم تحديث الوكيل" }); } } });
  const delAgent = useDeleteAgent({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAgentsQueryKey() }); setSelected(null); setDeleteAgent(null); } } });
  const createPay = useCreateAgentPayment({ mutation: { onSuccess: () => { if (selected) qc.invalidateQueries({ queryKey: getGetAgentDetailsQueryKey(selected) }); qc.invalidateQueries({ queryKey: getListAgentsQueryKey() }); setPayDialog(false); toast({ title: "تم تسجيل الدفعة" }); } } });
  const delPay = useDeleteAgentPayment({ mutation: { onSuccess: () => { if (selected) qc.invalidateQueries({ queryKey: getGetAgentDetailsQueryKey(selected) }); qc.invalidateQueries({ queryKey: getListAgentsQueryKey() }); setDeletePay(null); } } });

  function openNewAgent() { setEditingAgent(null); setAgentForm({ name: "", phone: "", notes: "" }); setAgentDialog(true); }
  function openEditAgent(a: any) { setEditingAgent(a); setAgentForm({ name: a.name, phone: a.phone ?? "", notes: a.notes ?? "" }); setAgentDialog(true); }

  if (selected && details) {
    const agent = details.agent;
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => setSelected(null)}><ChevronLeft className="w-4 h-4 ml-1" />العودة للقائمة</Button>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{agent.name}</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>طباعة <Printer className="w-3.5 h-3.5 mr-1" /></Button>
            <Button size="sm" onClick={() => { setPayForm({ amount: 0, direction: "from_agent", paidAt: today(), notes: "", createVoucher: false }); setPayDialog(true); }}>تسجيل دفعة</Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="إجمالي المبيعات" value={fmt(agent.totalSales)} />
          <StatCard label="مدفوع للمكتب" value={fmt(agent.paidFrom)} />
          <StatCard label="مدفوع للوكيل" value={fmt(agent.paidTo)} />
          <StatCard label="الرصيد" value={fmt(agent.balance)} highlight={agent.balance > 0 ? "orange" : "green"} sub={agent.balance > 0 ? "على الوكيل" : "مسوّى"} />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Card className="p-4">
            <h3 className="font-semibold mb-3 text-sm">المعاملات ({details.transactions.length})</h3>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {details.transactions.map((t: any) => (
                <div key={`${t.type}-${t.id}`} className="flex justify-between items-center text-xs py-1 border-b">
                  <div>
                    <span className="font-medium">{t.clientName}</span>
                    <Badge variant="outline" className="text-xs mr-1">{t.type}</Badge>
                  </div>
                  <span dir="ltr" className="font-medium">{fmt(t.salePrice)} ر.س</span>
                </div>
              ))}
              {details.transactions.length === 0 && <p className="text-muted-foreground text-xs text-center py-4">لا توجد معاملات</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold mb-3 text-sm">الدفعات ({details.payments.length})</h3>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {details.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center text-xs py-1 border-b">
                  <div>
                    <span className={p.direction === "from_agent" ? "text-blue-700" : "text-orange-700"}>{p.direction === "from_agent" ? "قبضنا" : "دفعنا"}</span>
                    <span className="text-muted-foreground mr-1">{formatDate(p.paidAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span dir="ltr" className="font-medium">{fmt(p.amount)} ر.س</span>
                    <Button variant="ghost" size="sm" className="h-6 px-1 text-destructive" onClick={() => setDeletePay(p.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
              {details.payments.length === 0 && <p className="text-muted-foreground text-xs text-center py-4">لا توجد دفعات</p>}
            </div>
          </Card>
        </div>

        <Dialog open={payDialog} onOpenChange={setPayDialog}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تسجيل دفعة مع {agent.name}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>الاتجاه</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={payForm.direction} onChange={(e) => setPayForm((f) => ({ ...f, direction: e.target.value }))}>
                  <option value="from_agent">قبضنا من الوكيل</option>
                  <option value="to_agent">دفعنا للوكيل</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>المبلغ (ر.س)</Label><Input type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: Number(e.target.value) }))} dir="ltr" className="text-left" /></div>
              <div className="space-y-1.5"><Label>التاريخ</Label><Input type="date" value={payForm.paidAt} onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))} dir="ltr" className="text-left" /></div>
              <div className="space-y-1.5"><Label>ملاحظات</Label><Input value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cv" checked={payForm.createVoucher} onChange={(e) => setPayForm((f) => ({ ...f, createVoucher: e.target.checked }))} />
                <Label htmlFor="cv">إنشاء سند تلقائياً</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialog(false)}>إلغاء</Button>
              <Button onClick={() => createPay.mutate({ id: selected!, data: payForm as any })} disabled={createPay.isPending}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deletePay != null} onOpenChange={(o) => { if (!o) setDeletePay(null); }}>
          <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle><AlertDialogDescription>حذف هذه الدفعة؟</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={() => delPay.mutate({ id: deletePay! })}>حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">{agents.length} وكيل</span>
        <Button size="sm" onClick={openNewAgent}><Plus className="w-4 h-4 ml-1" />إضافة وكيل</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a: any) => (
          <Card key={a.id} className="p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelected(a.id)}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold">{a.name}</p>
                {a.phone && <p className="text-xs text-muted-foreground" dir="ltr">{a.phone}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{a.txCount} معاملة</span>
                  {a.balance > 0 ? (
                    <Badge className="bg-orange-100 text-orange-800 text-xs">عليه {fmt(a.balance)} ر.س</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 text-xs">مسوّى</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditAgent(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteAgent(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {agents.length === 0 && <p className="text-muted-foreground text-sm col-span-3 text-center py-8">لا توجد وكلاء. أضف وكيلاً للبدء.</p>}
      </div>

      <Dialog open={agentDialog} onOpenChange={setAgentDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editingAgent ? "تعديل وكيل" : "إضافة وكيل"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>الاسم</Label><Input value={agentForm.name} onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>الهاتف</Label><Input value={agentForm.phone} onChange={(e) => setAgentForm((f) => ({ ...f, phone: e.target.value }))} dir="ltr" className="text-left" /></div>
            <div className="space-y-1.5"><Label>ملاحظات</Label><Input value={agentForm.notes} onChange={(e) => setAgentForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialog(false)}>إلغاء</Button>
            <Button onClick={() => editingAgent ? updateAgent.mutate({ id: editingAgent.id, data: agentForm }) : createAgent.mutate({ data: agentForm })} disabled={createAgent.isPending || updateAgent.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteAgent != null} onOpenChange={(o) => { if (!o) setDeleteAgent(null); }}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف الوكيل</AlertDialogTitle><AlertDialogDescription>المعاملات المرتبطة به ستبقى باسمه القديم.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={() => delAgent.mutate({ id: deleteAgent! })}>حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ClientsTab() {
  const { data: clients = [] } = useListClientAccounts();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { data: details } = useGetClientDetails({ name: selectedName ?? "" }, { query: { enabled: !!selectedName, queryKey: getGetClientDetailsQueryKey({ name: selectedName ?? "" }) } });

  if (selectedName && details) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => setSelectedName(null)}><ChevronLeft className="w-4 h-4 ml-1" />العودة</Button>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{details.account.clientName}</h2>
          <Button variant="outline" size="sm" onClick={() => window.print()}>طباعة <Printer className="w-3.5 h-3.5 mr-1" /></Button>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="إجمالي المبيعات" value={fmt(details.account.totalSales)} />
          <StatCard label="المستلم" value={fmt(details.account.totalReceived)} />
          <StatCard label="الرصيد المتبقي" value={fmt(details.account.balance)} highlight={details.account.balance > 0 ? "orange" : "green"} />
        </div>
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">المعاملات</h3>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {details.transactions.map((t: any) => (
              <div key={t.id} className="flex justify-between items-center text-xs py-1 border-b">
                <div><span className="font-medium">{t.clientName}</span><Badge variant="outline" className="text-xs mr-1">{t.type}</Badge></div>
                <div className="text-left">
                  <div dir="ltr" className="font-medium">{fmt(t.salePrice)} ر.س</div>
                  {t.receivedFromClient != null && <div className="text-muted-foreground">استلم: {fmt(t.receivedFromClient)}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {clients.length === 0 && <p className="text-center text-muted-foreground py-8">لا توجد أرصدة عملاء</p>}
      {clients.map((c: any) => (
        <Card key={c.clientName} className="p-4 cursor-pointer hover:border-primary/50" onClick={() => setSelectedName(c.clientName)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{c.clientName}</p>
              {c.phone && <p className="text-xs text-muted-foreground" dir="ltr">{c.phone}</p>}
            </div>
            <div className="text-left">
              <p className="text-xs text-muted-foreground">{c.txCount} معاملة</p>
              {c.balance > 0 ? (
                <Badge className="bg-orange-100 text-orange-800 text-xs">رصيد: {fmt(c.balance)} ر.س</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 text-xs">مسوّى</Badge>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function LedgerTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: entries = [] } = useListLedger();
  const { data: summary = [] } = useGetStatementSummary();
  const [form, setForm] = useState({ type: "income", amount: 0, description: "", entryDate: today() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const create = useCreateLedgerEntry({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListLedgerQueryKey() }); setDialogOpen(false); toast({ title: "تم الإضافة" }); } } });
  const del = useDeleteLedgerEntry({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListLedgerQueryKey() }); setDeleteId(null); } } });

  const totalIncome = entries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + e.amount, 0);
  const totalExpense = entries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + e.amount, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="إجمالي الإيرادات" value={fmt(totalIncome)} highlight="green" />
        <StatCard label="إجمالي المصاريف" value={fmt(totalExpense)} highlight="orange" />
        <StatCard label="الصافي" value={fmt(totalIncome - totalExpense)} highlight={totalIncome > totalExpense ? "green" : "orange"} />
      </div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">{entries.length} قيد</span>
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 ml-1" />إضافة قيد</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 text-right">النوع</th><th className="px-4 py-2 text-right">الوصف</th><th className="px-4 py-2 text-right">التاريخ</th><th className="px-4 py-2 text-left">المبلغ</th><th className="px-4 py-2 text-center">حذف</th></tr>
            </thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">لا توجد قيود</td></tr>}
              {entries.map((e: any) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2"><Badge variant={e.type === "income" ? "default" : "secondary"} className={e.type === "income" ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}>{e.type === "income" ? "إيراد" : "مصروف"}</Badge></td>
                  <td className="px-4 py-2">{e.description}</td>
                  <td className="px-4 py-2 text-xs">{formatDate(e.entryDate)}</td>
                  <td className="px-4 py-2 text-left" dir="ltr">{fmt(e.amount)} ر.س</td>
                  <td className="px-4 py-2 text-center"><Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة قيد للدفتر</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>النوع</Label><select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}><option value="income">إيراد</option><option value="expense">مصروف</option></select></div>
            <div className="space-y-1.5"><Label>المبلغ (ر.س)</Label><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} dir="ltr" className="text-left" /></div>
            <div className="space-y-1.5"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>التاريخ</Label><Input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} dir="ltr" className="text-left" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button><Button onClick={() => create.mutate({ data: form as any })} disabled={create.isPending}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" onClick={() => del.mutate({ id: deleteId! })}>حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, highlight, sub }: { label: string; value: string; highlight?: "green" | "orange"; sub?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${highlight === "green" ? "text-green-700" : highlight === "orange" ? "text-orange-600" : "text-foreground"}`} dir="ltr">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
