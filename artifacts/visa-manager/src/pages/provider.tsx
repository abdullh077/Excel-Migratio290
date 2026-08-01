import { useState } from "react";
import { useListAccounts, useCreateAccount, useDeleteAccount, useUpdateAccountExpiry, useUpdateAccountPassword, useUpdateAccountUsername, useGetMe, getListAccountsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Key, User, Calendar, Shield } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function ProviderPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: accounts = [] } = useListAccounts();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expiryId, setExpiryId] = useState<number | null>(null);
  const [pwdId, setPwdId] = useState<number | null>(null);
  const [usernameId, setUsernameId] = useState<number | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "owner", parentUserId: "", expiresAt: "" });
  const [expiryVal, setExpiryVal] = useState("");
  const [pwdVal, setPwdVal] = useState("");
  const [usernameVal, setUsernameVal] = useState("");

  const create = useCreateAccount({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAccountsQueryKey() }); setCreateOpen(false); setForm({ username: "", password: "", role: "owner", parentUserId: "", expiresAt: "" }); toast({ title: "تم إنشاء الحساب" }); } } });
  const del = useDeleteAccount({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAccountsQueryKey() }); setDeleteId(null); } } });
  const setExpiry = useUpdateAccountExpiry({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAccountsQueryKey() }); setExpiryId(null); toast({ title: "تم تحديث انتهاء الاشتراك" }); } } });
  const setPwd = useUpdateAccountPassword({ mutation: { onSuccess: () => { setPwdId(null); setPwdVal(""); toast({ title: "تم تغيير كلمة المرور" }); } } });
  const setUsername = useUpdateAccountUsername({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAccountsQueryKey() }); setUsernameId(null); setUsernameVal(""); toast({ title: "تم تغيير اسم المستخدم" }); } } });

  const owners = accounts.filter((a: any) => a.role === "owner");
  const subs = accounts.filter((a: any) => a.role === "sub");

  function isExpired(a: any) {
    return a.expiresAt && new Date(a.expiresAt) < new Date();
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">إدارة الحسابات</h1>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />إنشاء حساب</Button>
        </div>

        {/* Provider "My Account" card */}
        {me && (
          <Card className="p-4 mb-6 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <div>
                <p className="font-semibold text-sm">حسابي — {me.username}</p>
                <p className="text-xs text-muted-foreground">دور: {me.role === "provider" ? "مزود الخدمة" : me.role === "owner" ? "مالك مكتب" : "موظف"}</p>
                {me.expiresAt && <p className="text-xs text-orange-600">ينتهي في: {formatDate(me.expiresAt)}</p>}
                {!me.expiresAt && <p className="text-xs text-green-600">اشتراك غير محدود</p>}
              </div>
            </div>
          </Card>
        )}

        {/* Owners Table */}
        <Card className="p-4 mb-6">
          <h2 className="font-semibold mb-3">المكاتب (مالكو الحسابات) — {owners.length}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="pb-2 text-right font-medium">المستخدم</th>
                  <th className="pb-2 text-right font-medium">المكتب</th>
                  <th className="pb-2 text-right font-medium">تاريخ الإنشاء</th>
                  <th className="pb-2 text-right font-medium">انتهاء الاشتراك</th>
                  <th className="pb-2 text-right font-medium">الحالة</th>
                  <th className="pb-2 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {owners.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">لا توجد مكاتب</td></tr>}
                {owners.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 font-medium" dir="ltr">{a.username}</td>
                    <td className="py-2">{a.officeName ?? "—"}</td>
                    <td className="py-2 text-xs">{formatDate(a.createdAt)}</td>
                    <td className="py-2 text-xs">{a.expiresAt ? formatDate(a.expiresAt) : <span className="text-green-600">غير محدود</span>}</td>
                    <td className="py-2">
                      {isExpired(a) ? <Badge className="bg-red-100 text-red-800 text-xs">منتهي</Badge> : <Badge className="bg-green-100 text-green-800 text-xs">نشط</Badge>}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير الانتهاء" onClick={() => { setExpiryId(a.id); setExpiryVal(a.expiresAt ? a.expiresAt.slice(0, 10) : ""); }}><Calendar className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير اسم المستخدم" onClick={() => { setUsernameId(a.id); setUsernameVal(a.username); }}><User className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" title="تغيير كلمة المرور" onClick={() => { setPwdId(a.id); setPwdVal(""); }}><Key className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Subs */}
        {subs.length > 0 && (
          <Card className="p-4">
            <h2 className="font-semibold mb-3">الموظفون (حسابات فرعية) — {subs.length}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="pb-2 text-right font-medium">المستخدم</th>
                    <th className="pb-2 text-right font-medium">تابع لـ</th>
                    <th className="pb-2 text-center font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((a: any) => {
                    const owner = accounts.find((o: any) => o.id === a.parentUserId);
                    return (
                      <tr key={a.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 font-medium" dir="ltr">{a.username}</td>
                        <td className="py-2 text-sm text-muted-foreground">{owner?.username ?? a.parentUserId}</td>
                        <td className="py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setUsernameId(a.id); setUsernameVal(a.username); }}><User className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setPwdId(a.id); setPwdVal(""); }}><Key className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>إنشاء حساب جديد</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>اسم المستخدم</Label>
                <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <Input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>نوع الحساب</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="owner">مكتب (مالك)</option>
                  <option value="sub">موظف (فرعي)</option>
                </select>
              </div>
              {form.role === "sub" && (
                <div className="space-y-1.5">
                  <Label>تابع للمكتب</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.parentUserId} onChange={(e) => setForm((f) => ({ ...f, parentUserId: e.target.value }))}>
                    <option value="">اختر مكتباً...</option>
                    {owners.map((o: any) => <option key={o.id} value={o.id}>{o.username} {o.officeName ? `— ${o.officeName}` : ""}</option>)}
                  </select>
                </div>
              )}
              {form.role === "owner" && (
                <div className="space-y-1.5">
                  <Label>تاريخ انتهاء الاشتراك (اتركه فارغاً لغير محدود)</Label>
                  <Input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} dir="ltr" className="text-left" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button onClick={() => create.mutate({ data: { username: form.username, password: form.password, role: form.role as any, parentUserId: form.parentUserId ? Number(form.parentUserId) : undefined, expiresAt: form.expiresAt || null } as any })} disabled={create.isPending}>إنشاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Expiry Dialog */}
        <Dialog open={expiryId != null} onOpenChange={(o) => { if (!o) setExpiryId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تحديث انتهاء الاشتراك</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>تاريخ الانتهاء (اتركه فارغاً لغير محدود)</Label>
              <Input type="date" value={expiryVal} onChange={(e) => setExpiryVal(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExpiryId(null)}>إلغاء</Button>
              <Button onClick={() => setExpiry.mutate({ id: expiryId!, data: { expiresAt: expiryVal || null } as any })} disabled={setExpiry.isPending}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Password Dialog */}
        <Dialog open={pwdId != null} onOpenChange={(o) => { if (!o) setPwdId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="text" value={pwdVal} onChange={(e) => setPwdVal(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwdId(null)}>إلغاء</Button>
              <Button onClick={() => setPwd.mutate({ id: pwdId!, data: { password: pwdVal } })} disabled={setPwd.isPending || !pwdVal}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Username Dialog */}
        <Dialog open={usernameId != null} onOpenChange={(o) => { if (!o) setUsernameId(null); }}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>تغيير اسم المستخدم</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              <Label>اسم المستخدم الجديد</Label>
              <Input type="text" value={usernameVal} onChange={(e) => setUsernameVal(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUsernameId(null)}>إلغاء</Button>
              <Button onClick={() => setUsername.mutate({ id: usernameId!, data: { username: usernameVal } })} disabled={setUsername.isPending || !usernameVal}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذا الحساب؟ سيتم حذف جميع بياناته.</AlertDialogDescription></AlertDialogHeader>
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
