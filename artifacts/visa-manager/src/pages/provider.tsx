import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Key, User, Calendar, Download, DatabaseBackup, RefreshCw, Building2, History, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const ACCOUNTS_KEY = ["/api/provider/accounts"];
const BACKUPS_KEY = ["/api/provider/backups"];

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function patchJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function del(url: string) {
  const res = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function ProviderPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: accounts = [] } = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: () => fetchJson("/api/provider/accounts") });

  const owners = accounts.filter((a: any) => a.role === "owner");
  const subs = accounts.filter((a: any) => a.role === "sub");

  // dialogs
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [pwdId, setPwdId] = useState<number | null>(null);
  const [renewId, setRenewId] = useState<number | null>(null);
  const [officeNameId, setOfficeNameId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // form state
  const [ownerForm, setOwnerForm] = useState({ username: "", password: "", officeName: "", duration: "12", expiresAt: "" });
  const [renewCustomDate, setRenewCustomDate] = useState("");
  const [officeNameVal, setOfficeNameVal] = useState("");
  const [subForm, setSubForm] = useState({ parentUserId: "", username: "", password: "", customDate: false });
  const [renameVal, setRenameVal] = useState("");
  const [pwdVal, setPwdVal] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });

  const createOwner = useMutation({
    mutationFn: () =>
      postJson("/api/provider/owners", {
        username: ownerForm.username,
        password: ownerForm.password,
        officeName: ownerForm.officeName || null,
        // Server computes calendar-safe expiry from months; custom date sent as-is.
        months: ownerForm.duration !== "custom" && ownerForm.duration !== "none" ? Number(ownerForm.duration) : null,
        expiresAt: ownerForm.duration === "custom" ? ownerForm.expiresAt || null : null,
      }),
    onSuccess: () => {
      invalidate();
      setOwnerOpen(false);
      setOwnerForm({ username: "", password: "", officeName: "", duration: "12", expiresAt: "" });
      toast({ title: "تم إنشاء حساب المكتب" });
    },
    onError: () => toast({ title: "تعذّر إنشاء الحساب", variant: "destructive" }),
  });

  const renewMut = useMutation({
    mutationFn: (months: number) => postJson(`/api/provider/accounts/${renewId}/renew`, { months }),
    onSuccess: () => { invalidate(); setRenewId(null); toast({ title: "تم تجديد الاشتراك بنجاح" }); },
    onError: () => toast({ title: "تعذّر التجديد", variant: "destructive" }),
  });

  const renewCustomMut = useMutation({
    mutationFn: () => patchJson(`/api/provider/accounts/${renewId}/expiry`, { expiresAt: renewCustomDate }),
    onSuccess: () => { invalidate(); setRenewId(null); setRenewCustomDate(""); toast({ title: "تم تحديث تاريخ الانتهاء" }); },
    onError: () => toast({ title: "تعذّر التحديث", variant: "destructive" }),
  });

  const officeNameMut = useMutation({
    mutationFn: () => patchJson(`/api/provider/accounts/${officeNameId}/office-name`, { officeName: officeNameVal }),
    onSuccess: () => { invalidate(); setOfficeNameId(null); setOfficeNameVal(""); toast({ title: "تم حفظ اسم المكتب" }); },
    onError: () => toast({ title: "تعذّر الحفظ", variant: "destructive" }),
  });

  const createSub = useMutation({
    mutationFn: () => postJson("/api/provider/subs", {
      parentId: subForm.parentUserId ? Number(subForm.parentUserId) : undefined,
      username: subForm.username,
      password: subForm.password,
    }),
    onSuccess: () => {
      invalidate();
      setSubOpen(false);
      setSubForm({ parentUserId: "", username: "", password: "", customDate: false });
      toast({ title: "تم إنشاء الحساب الفرعي" });
    },
  });

  const renameMut = useMutation({
    mutationFn: () => patchJson(`/api/provider/accounts/${renameId}/username`, { username: renameVal }),
    onSuccess: () => { invalidate(); setRenameId(null); setRenameVal(""); toast({ title: "تم تغيير الاسم" }); },
  });

  const pwdMut = useMutation({
    mutationFn: () => patchJson(`/api/provider/accounts/${pwdId}/password`, { password: pwdVal }),
    onSuccess: () => { setPwdId(null); setPwdVal(""); toast({ title: "تم تغيير كلمة المرور" }); },
  });

  const deleteMut = useMutation({
    mutationFn: () => del(`/api/provider/accounts/${deleteId}`),
    onSuccess: () => { invalidate(); setDeleteId(null); },
  });

  // Backups
  const { data: backups = [] } = useQuery({ queryKey: BACKUPS_KEY, queryFn: () => fetchJson("/api/provider/backups") });
  const backupMut = useMutation({
    mutationFn: () => postJson("/api/provider/backup", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BACKUPS_KEY });
      toast({ title: "تم حفظ النسخة الاحتياطية بنجاح" });
    },
    onError: () => toast({ title: "تعذّر أخذ النسخة", variant: "destructive" }),
  });

  // Restore
  const [restoreTarget, setRestoreTarget] = useState<{ id: number; createdAt?: string } | null>(null);
  const [uploadPayload, setUploadPayload] = useState<any | null>(null);
  const [uploadName, setUploadName] = useState("");
  const restoreMut = useMutation({
    mutationFn: () =>
      restoreTarget
        ? postJson(`/api/provider/backups/${restoreTarget.id}/restore`, {})
        : postJson("/api/provider/restore-upload", { payload: uploadPayload }),
    onSuccess: () => {
      qc.invalidateQueries();
      setRestoreTarget(null);
      setUploadPayload(null);
      setUploadName("");
      toast({ title: "تمت استعادة البيانات بنجاح", description: "أُخذت نسخة أمان من البيانات السابقة قبل الاستعادة." });
    },
    onError: () => toast({ title: "تعذّرت الاستعادة", description: "لم يتم تغيير أي بيانات.", variant: "destructive" }),
  });

  function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.version !== 2 || !parsed?.data) throw new Error("bad");
        setUploadPayload(parsed);
        setUploadName(file.name);
      } catch {
        toast({ title: "ملف غير صالح", description: "الملف ليس نسخة احتياطية صحيحة.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  function isExpired(a: any) {
    return a.expiresAt && new Date(a.expiresAt) < new Date();
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <h1 className="text-xl font-bold mb-6">إدارة المزوّد</h1>

        <Tabs defaultValue="owners">
          <TabsList>
            <TabsTrigger value="owners">الحسابات الرئيسية</TabsTrigger>
            <TabsTrigger value="subs">الحسابات الفرعية</TabsTrigger>
            <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>
          </TabsList>

          {/* Owners */}
          <TabsContent value="owners">
            <div className="flex items-start justify-between mb-4 gap-4">
              <p className="text-sm text-muted-foreground max-w-2xl">
                كل مكتب له حساب رئيسي واشتراك بمدة محددة. الحسابات الفرعية تتبع اشتراكه وتُدار من تبويبها الخاص.
              </p>
              <Button size="sm" onClick={() => setOwnerOpen(true)}><Plus className="w-4 h-4 ml-1" />مكتب جديد</Button>
            </div>
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="pb-2 text-right font-medium">اسم المستخدم</th>
                      <th className="pb-2 text-right font-medium">المكتب</th>
                      <th className="pb-2 text-right font-medium">تاريخ الإنشاء</th>
                      <th className="pb-2 text-right font-medium">تاريخ الانتهاء</th>
                      <th className="pb-2 text-right font-medium">الحالة</th>
                      <th className="pb-2 text-center font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">لا توجد حسابات</td></tr>}
                    {owners.map((a: any) => (
                      <tr key={a.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 font-medium" dir="ltr">{a.username}</td>
                        <td className="py-2">{a.officeName ?? "—"}</td>
                        <td className="py-2 text-xs">{formatDate(a.createdAt)}</td>
                        <td className="py-2 text-xs">
                          {a.expiresAt
                            ? formatDate(a.expiresAt)
                            : a.pendingMonths
                              ? <span className="text-blue-600">يبدأ عند أول دخول ({a.pendingMonths} شهر)</span>
                              : <span className="text-green-600">غير محدود</span>}
                        </td>
                        <td className="py-2">
                          {isExpired(a) ? <Badge className="bg-red-100 text-red-800 text-xs">منتهي</Badge> : <Badge className="bg-green-100 text-green-800 text-xs">نشط</Badge>}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center justify-center gap-1">
                            {isExpired(a) ? (
                              <Button size="sm" className="h-7 px-2 text-xs bg-accent text-accent-foreground hover:bg-accent/90" title="تجديد الاشتراك" onClick={() => setRenewId(a.id)}>
                                <RefreshCw className="w-3.5 h-3.5 ml-1" />تجديد
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-7 px-2" title="تجديد الاشتراك" onClick={() => setRenewId(a.id)}><RefreshCw className="w-3.5 h-3.5" /></Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 px-2" title="اسم المكتب (مرجع)" onClick={() => { setOfficeNameId(a.id); setOfficeNameVal(a.officeName ?? ""); }}><Building2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير الاسم" onClick={() => { setRenameId(a.id); setRenameVal(a.username); }}><User className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير كلمة المرور" onClick={() => { setPwdId(a.id); setPwdVal(""); }}><Key className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" title="حذف المكتب" onClick={() => setDeleteId(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Subs */}
          <TabsContent value="subs">
            <div className="flex items-center justify-end mb-4">
              <Button size="sm" onClick={() => setSubOpen(true)}><Plus className="w-4 h-4 ml-1" />حساب فرعي جديد</Button>
            </div>
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="pb-2 text-right font-medium">اسم المستخدم</th>
                      <th className="pb-2 text-right font-medium">يتبع الحساب الرئيسي</th>
                      <th className="pb-2 text-center font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-muted-foreground text-xs">لا توجد حسابات</td></tr>}
                    {subs.map((a: any) => {
                      const owner = accounts.find((o: any) => o.id === a.parentUserId);
                      return (
                        <tr key={a.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 font-medium" dir="ltr">{a.username}</td>
                          <td className="py-2 text-sm text-muted-foreground">{owner?.username ?? a.parentUserId}</td>
                          <td className="py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير الاسم" onClick={() => { setRenameId(a.id); setRenameVal(a.username); }}><User className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير كلمة المرور" onClick={() => { setPwdId(a.id); setPwdVal(""); }}><Key className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" title="حذف المكتب" onClick={() => setDeleteId(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Backup */}
          <TabsContent value="backup">
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <DatabaseBackup className="w-5 h-5 text-primary" /> النسخ الاحتياطي لبيانات السيرفر
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  يُؤخذ تلقائياً نسخة كاملة من بيانات السيرفر مرة واحدة كل يوم (عند أول تسجيل دخول)،
                  وتُحفظ داخل قاعدة البيانات المركزية. تُحتفظ آخر 30 نسخة.
                  كما تُحفظ نسخة من بيانات كل مكتب على جهازه تلقائياً مرة يومياً عند فتح البرنامج.
                </p>
              </div>
              <Button size="sm" onClick={() => backupMut.mutate()} disabled={backupMut.isPending}>
                <DatabaseBackup className="w-4 h-4 ml-1" />
                {backupMut.isPending ? "جارٍ الحفظ..." : "إنشاء نسخة احتياطية الآن"}
              </Button>
              {backups.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد نسخ بعد — ستُنشأ أول نسخة تلقائياً عند أول تسجيل دخول اليوم.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                        <th className="px-3 py-2 text-right font-medium">النوع</th>
                        <th className="px-3 py-2 text-right font-medium">الحجم</th>
                        <th className="px-3 py-2 text-left font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {backups.map((b: { id: number; name: string; kind?: string; size?: number; createdAt?: string }) => (
                        <tr key={b.id}>
                          <td className="px-3 py-2">
                            {b.createdAt
                              ? new Date(b.createdAt).toLocaleString("ar-SA-u-ca-gregory", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {b.kind === "auto" ? "تلقائية (يومية)" : "يدوية"}
                          </td>
                          <td className="px-3 py-2 text-xs" dir="ltr">
                            {b.size ? `${(b.size / 1024).toFixed(0)} KB` : "—"}
                          </td>
                          <td className="px-3 py-2 text-left">
                            <div className="inline-flex items-center gap-3">
                              <a href={`/api/provider/backups/${b.id}`} download className="text-primary inline-flex items-center gap-1 text-xs">
                                <Download className="w-3.5 h-3.5" />تنزيل إلى الجهاز
                              </a>
                              <button
                                type="button"
                                onClick={() => setRestoreTarget({ id: b.id, createdAt: b.createdAt })}
                                className="text-destructive inline-flex items-center gap-1 text-xs"
                              >
                                <History className="w-3.5 h-3.5" />استعادة
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 border-t">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> استعادة من ملف نسخة احتياطية
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  اختر ملف نسخة احتياطية (.json) سبق تنزيله من هنا لاستعادة البيانات منه.
                </p>
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-primary cursor-pointer border rounded-md px-3 py-1.5 hover:bg-muted/50">
                  <Upload className="w-3.5 h-3.5" /> اختيار ملف...
                  <input type="file" accept=".json,application/json" className="hidden" onChange={onUploadFile} />
                </label>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Restore confirmation */}
        <AlertDialog
          open={!!restoreTarget || !!uploadPayload}
          onOpenChange={(open) => { if (!open) { setRestoreTarget(null); setUploadPayload(null); setUploadName(""); } }}
        >
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>استعادة البيانات من نسخة احتياطية؟</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {restoreTarget?.createdAt
                      ? <>سيتم استبدال جميع البيانات الحالية ببيانات النسخة المؤرَّخة في{" "}
                          <span className="font-medium">{new Date(restoreTarget.createdAt).toLocaleString("ar-SA-u-ca-gregory", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>.
                        </>
                      : <>سيتم استبدال جميع البيانات الحالية ببيانات الملف <span className="font-medium" dir="ltr">{uploadName}</span>.</>}
                  </p>
                  <p className="text-destructive font-medium">
                    تحذير: جميع البيانات الحالية (العملاء، التأشيرات، الوكلاء، السندات، الإعدادات، الحسابات) ستُستبدل ولا يمكن التراجع مباشرة.
                  </p>
                  <p>ستُؤخذ نسخة أمان من البيانات الحالية تلقائياً قبل الاستعادة.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={restoreMut.isPending}
                onClick={(e) => { e.preventDefault(); restoreMut.mutate(); }}
              >
                {restoreMut.isPending ? "جارٍ الاستعادة..." : "نعم، استعادة البيانات"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Owner Dialog */}
        <Dialog open={ownerOpen} onOpenChange={setOwnerOpen}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>مكتب جديد (حساب رئيسي)</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>اسم المستخدم</Label>
                <Input value={ownerForm.username} onChange={(e) => setOwnerForm((f) => ({ ...f, username: e.target.value }))} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <Input type="text" value={ownerForm.password} onChange={(e) => setOwnerForm((f) => ({ ...f, password: e.target.value }))} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>اسم المكتب (مرجع لك)</Label>
                <Input value={ownerForm.officeName} onChange={(e) => setOwnerForm((f) => ({ ...f, officeName: e.target.value }))} placeholder="مثال: مكتب النور للعمرة — صنعاء" />
                <p className="text-xs text-muted-foreground">يظهر في جدول الحسابات لتعرف هذا الحساب يخص أي مكتب.</p>
              </div>
              <div className="space-y-1.5">
                <Label>مدة الاشتراك</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ v: "1", t: "شهر" }, { v: "3", t: "3 أشهر" }, { v: "6", t: "6 أشهر" }, { v: "12", t: "سنة" }, { v: "none", t: "غير محدود" }, { v: "custom", t: "تاريخ مخصص" }].map(({ v, t }) => (
                    <Button key={v} type="button" variant={ownerForm.duration === v ? "default" : "outline"} size="sm" onClick={() => setOwnerForm((f) => ({ ...f, duration: v }))}>{t}</Button>
                  ))}
                </div>
              </div>
              {ownerForm.duration === "custom" && (
                <div className="space-y-1.5">
                  <Label>تاريخ الانتهاء</Label>
                  <Input type="date" value={ownerForm.expiresAt} onChange={(e) => setOwnerForm((f) => ({ ...f, expiresAt: e.target.value }))} dir="ltr" className="text-left" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOwnerOpen(false)}>إلغاء</Button>
              <Button onClick={() => createOwner.mutate()} disabled={createOwner.isPending}>إنشاء الحساب</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Sub Dialog */}
        <Dialog open={subOpen} onOpenChange={setSubOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>حساب فرعي جديد</DialogTitle>
              <DialogDescription>
                الحساب الفرعي يشارك نفس بيانات المكتب الذي يتبعه، وينتهي اشتراكه مع الحساب الرئيسي في نفس اللحظة.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>يتبع الحساب الرئيسي</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={subForm.parentUserId} onChange={(e) => setSubForm((f) => ({ ...f, parentUserId: e.target.value }))}>
                  <option value="">اختر المكتب</option>
                  {owners.map((o: any) => <option key={o.id} value={o.id}>{o.username}{o.officeName ? ` — ${o.officeName}` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>اسم المستخدم</Label>
                <Input value={subForm.username} onChange={(e) => setSubForm((f) => ({ ...f, username: e.target.value }))} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <Input type="text" value={subForm.password} onChange={(e) => setSubForm((f) => ({ ...f, password: e.target.value }))} dir="ltr" className="text-left" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={subForm.customDate} onChange={(e) => setSubForm((f) => ({ ...f, customDate: e.target.checked }))} />
                تاريخ مخصص
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubOpen(false)}>إلغاء</Button>
              <Button onClick={() => createSub.mutate()} disabled={createSub.isPending}>إنشاء الحساب</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={renameId != null} onOpenChange={(o) => { if (!o) setRenameId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تغيير الاسم</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>اسم المستخدم</Label>
              <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameId(null)}>إلغاء</Button>
              <Button onClick={() => renameMut.mutate()} disabled={renameMut.isPending || !renameVal}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Password Dialog */}
        <Dialog open={pwdId != null} onOpenChange={(o) => { if (!o) setPwdId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>كلمة المرور</Label>
              <Input type="text" value={pwdVal} onChange={(e) => setPwdVal(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwdId(null)}>إلغاء</Button>
              <Button onClick={() => pwdMut.mutate()} disabled={pwdMut.isPending || !pwdVal}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Renew Dialog */}
        <Dialog open={renewId != null} onOpenChange={(o) => { if (!o) setRenewId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>تجديد الاشتراك</DialogTitle>
              <DialogDescription>
                اختر مدة التجديد وتُضاف مباشرة إلى نهاية الاشتراك الحالي (أو من اليوم إذا كان منتهياً).
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              {[{ m: 1, t: "شهر واحد" }, { m: 3, t: "3 أشهر" }, { m: 6, t: "6 أشهر" }, { m: 12, t: "سنة كاملة" }].map(({ m, t }) => (
                <Button key={m} variant="outline" className="h-14 text-base border-accent/50 hover:bg-accent/10 hover:border-accent" disabled={renewMut.isPending} onClick={() => renewMut.mutate(m)}>
                  <RefreshCw className="w-4 h-4 ml-2 text-accent" />{t}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <Label>أو تاريخ انتهاء مخصص</Label>
              <div className="flex gap-2">
                <Input type="date" value={renewCustomDate} onChange={(e) => setRenewCustomDate(e.target.value)} dir="ltr" className="text-left" />
                <Button disabled={!renewCustomDate || renewCustomMut.isPending} onClick={() => renewCustomMut.mutate()}>حفظ</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenewId(null)}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Office Name Dialog */}
        <Dialog open={officeNameId != null} onOpenChange={(o) => { if (!o) setOfficeNameId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>اسم المكتب (مرجع)</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>اسم المكتب</Label>
              <Input value={officeNameVal} onChange={(e) => setOfficeNameVal(e.target.value)} placeholder="مثال: مكتب النور للعمرة — صنعاء" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOfficeNameId(null)}>إلغاء</Button>
              <Button onClick={() => officeNameMut.mutate()} disabled={officeNameMut.isPending || !officeNameVal.trim()}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف المكتب</AlertDialogTitle>
              <AlertDialogDescription>هل أنت متأكد من حذف هذا الحساب؟ سيتم حذف جميع بياناته.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white" onClick={() => deleteMut.mutate()}>حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
