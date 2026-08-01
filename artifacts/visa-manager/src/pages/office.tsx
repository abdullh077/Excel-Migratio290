import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout, downloadOfficeBackup } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@/hooks/useAuth";
import { Upload, X, UserCog, Loader2, Lock, KeyRound, Pencil, DatabaseBackup, Download } from "lucide-react";

const OFFICE_KEY = ["/api/settings/office"];

async function fetchOffice() {
  const res = await fetch("/api/settings/office", { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function saveOffice(body: any) {
  const res = await fetch("/api/settings/office", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function saveBranding(officeLogo: string | null) {
  const res = await fetch("/api/settings/branding", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ officeLogo }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const DEFAULT_UMRAH_TEMPLATE =
  "السلام عليكم ورحمة الله،\nمن {office}.\nنذكّركم بقرب انتهاء مدة إقامة العمرة الخاصة بالمعتمر: {name}.\nالمتبقّي: {days} يوماً.\nنرجو التكرم بمراجعتنا لإتمام إجراءات المغادرة في الوقت المحدد.\nشاكرين لكم حسن تعاونكم.";

const DEFAULT_OTHER_TEMPLATE =
  "السلام عليكم ورحمة الله،\nعزيزنا {name}،\nمعكم {office}.\nبخصوص تأشيرتكم من نوع ({visaType})، نرجو التواصل معنا لأي استفسار أو لاستكمال الإجراءات.\nشاكرين لكم.";

export default function OfficePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery({ queryKey: OFFICE_KEY, queryFn: fetchOffice });

  const [form, setForm] = useState({
    officeName: "",
    officePhone: "",
    officePhone2: "",
    officeAddress: "",
    whatsappUmrahTemplate: "",
    whatsappOtherTemplate: "",
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const stampInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        officeName: settings.officeName ?? "",
        officePhone: settings.officePhone ?? "",
        officePhone2: settings.officePhone2 ?? "",
        officeAddress: settings.officeAddress ?? "",
        // Prefill defaults only when never set (null/undefined) — keep an intentionally-cleared template empty.
        whatsappUmrahTemplate: settings.whatsappUmrahTemplate ?? DEFAULT_UMRAH_TEMPLATE,
        whatsappOtherTemplate: settings.whatsappOtherTemplate ?? DEFAULT_OTHER_TEMPLATE,
      });
      setLogo(settings.officeLogo ?? null);
      setStamp(settings.stampImage ?? null);
      setSignature(settings.signatureImage ?? null);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const result = await saveOffice({
        ...form,
        officeLogo: logo,
        stampImage: stamp,
        signatureImage: signature,
        configured: true,
      });
      // Ensure the public branding row (read by the login page) has the logo too.
      await saveBranding(logo);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OFFICE_KEY });
      if (logo) localStorage.setItem("oboor-last-logo", logo);
      else localStorage.removeItem("oboor-last-logo");
      toast({ title: "تم حفظ بيانات المكتب" });
    },
  });

  const brandingMut = useMutation({
    mutationFn: (v: string | null) => saveBranding(v),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: OFFICE_KEY });
      if (v) {
        localStorage.setItem("oboor-last-logo", v);
        toast({ title: "تم حفظ الشعار" });
      } else {
        localStorage.removeItem("oboor-last-logo");
        toast({ title: "تم حذف الشعار" });
      }
    },
  });

  function set(key: keyof typeof form) {
    return (v: string) => setForm((prev) => ({ ...prev, [key]: v }));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      toast({ title: "اختر صورة أصغر من 1.5 ميجابايت", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogo(dataUrl);
      brandingMut.mutate(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogo(null);
    brandingMut.mutate(null);
  }

  function handleImageUpload(setter: (v: string | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > 1.5 * 1024 * 1024) {
        toast({ title: "اختر صورة أصغر من 1.5 ميجابايت", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setter(ev.target?.result as string);
      reader.readAsDataURL(file);
    };
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="mb-6">
          <h1 className="text-xl font-bold">بيانات المكتب</h1>
          <p className="text-sm text-muted-foreground mt-1">تظهر هذه البيانات في سندات القبض ورسائل واتساب.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logo */}
          <Card className="p-5 space-y-3 lg:col-span-2">
            <Label>شعار المكتب (يظهر في شاشة تسجيل الدخول)</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logo ? <img src={logo} alt="شعار المكتب" className="w-full h-full object-contain" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()} disabled={brandingMut.isPending}>
                  <Upload className="w-4 h-4 ml-1" />رفع صورة
                </Button>
                {logo && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={removeLogo} disabled={brandingMut.isPending}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </Card>

          {/* Stamp */}
          <Card className="p-5 space-y-3">
            <Label>ختم المكتب (يظهر في السند)</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {stamp ? <img src={stamp} alt="ختم المكتب" className="w-full h-full object-contain" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => stampInput.current?.click()}>
                  <Upload className="w-4 h-4 ml-1" />رفع صورة
                </Button>
                {stamp && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setStamp(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input ref={stampInput} type="file" accept="image/*" className="hidden" onChange={handleImageUpload(setStamp)} />
            </div>
            <p className="text-xs text-muted-foreground">احفظ البيانات لتطبيق التغيير على السند.</p>
          </Card>

          {/* Signature */}
          <Card className="p-5 space-y-3">
            <Label>توقيع المكتب (يظهر في السند)</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {signature ? <img src={signature} alt="توقيع المكتب" className="w-full h-full object-contain" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => signatureInput.current?.click()}>
                  <Upload className="w-4 h-4 ml-1" />رفع صورة
                </Button>
                {signature && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setSignature(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input ref={signatureInput} type="file" accept="image/*" className="hidden" onChange={handleImageUpload(setSignature)} />
            </div>
            <p className="text-xs text-muted-foreground">احفظ البيانات لتطبيق التغيير على السند.</p>
          </Card>

          {/* Office fields */}
          <Card className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>اسم المكتب *</Label>
              <Input value={form.officeName} onChange={(e) => set("officeName")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>الهاتف الأساسي</Label>
              <Input value={form.officePhone} onChange={(e) => set("officePhone")(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-1.5">
              <Label>هاتف إضافي</Label>
              <Input value={form.officePhone2} onChange={(e) => set("officePhone2")(e.target.value)} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-1.5">
              <Label>العنوان</Label>
              <Input value={form.officeAddress} onChange={(e) => set("officeAddress")(e.target.value)} />
            </div>
          </Card>

          {/* WhatsApp templates */}
          <Card className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>قالب رسالة واتساب — العمرة</Label>
              <Textarea className="min-h-[100px] resize-y" value={form.whatsappUmrahTemplate} onChange={(e) => set("whatsappUmrahTemplate")(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                تُستبدل تلقائياً: <b>{"{office}"}</b> اسم المكتب · <b>{"{name}"}</b> اسم المعتمر · <b>{"{days}"}</b> الأيام المتبقية
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>قالب رسالة واتساب — تأشيرات أخرى</Label>
              <Textarea className="min-h-[100px] resize-y" value={form.whatsappOtherTemplate} onChange={(e) => set("whatsappOtherTemplate")(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                تُستبدل تلقائياً: <b>{"{office}"}</b> اسم المكتب · <b>{"{name}"}</b> اسم العميل · <b>{"{visaType}"}</b> نوع التأشيرة
              </p>
            </div>
          </Card>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>حفظ</Button>
        </div>

        <SubAccountsSection />
        <BackupRestoreSection />
      </div>

    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Office backup & restore (owner only): save a copy to this device, and
// restore the office's data from a server snapshot or an uploaded file.
// ---------------------------------------------------------------------------
function BackupRestoreSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const fileRef = useRef<HTMLInputElement>(null);

  // Strictly owner: providers restore from their own admin page.
  const isOwner = me?.role === "owner";

  const { data: serverBackups = [] } = useQuery({
    queryKey: ["office-backups"],
    queryFn: async () => {
      const res = await fetch("/api/office/backups", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: isOwner,
  });

  // Pending restore action awaiting confirmation
  const [confirm, setConfirm] = useState<null | { kind: "server"; id: number; label: string } | { kind: "file"; payload: any; label: string }>(null);

  const restoreMut = useMutation({
    mutationFn: async () => {
      if (!confirm) return;
      const res = confirm.kind === "server"
        ? await fetch(`/api/office/backups/${confirm.id}/restore`, { method: "POST", credentials: "include" })
        : await fetch("/api/office/restore-upload", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload: confirm.payload }),
          });
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        throw new Error(t?.error || "تعذّرت الاستعادة");
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirm(null);
      qc.clear();
      toast({ title: "تمت استعادة البيانات بنجاح" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "تعذّرت الاستعادة", description: e.message }),
  });

  if (!isOwner) return null;

  const fmtDT = (s: string) =>
    new Date(s).toLocaleString("ar-SA-u-ca-gregory", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const payload = JSON.parse(await f.text());
      setConfirm({ kind: "file", payload, label: `الملف «${f.name}»` });
    } catch {
      toast({ variant: "destructive", title: "الملف غير صالح", description: "اختر ملف نسخة احتياطية بصيغة JSON" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <DatabaseBackup className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold">النسخ الاحتياطي والاستعادة</h2>
          <p className="text-sm text-muted-foreground">
            تُحفظ نسخة من بيانات مكتبك على جهازك تلقائياً مرة يومياً وعند كل تسجيل خروج، ويمكنك استعادة بياناتك في أي وقت.
          </p>
        </div>
      </div>
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadOfficeBackup().catch(() => toast({ variant: "destructive", title: "تعذّر حفظ النسخة" }))}>
            <Download className="w-4 h-4 ml-1" /> حفظ نسخة على جهازي الآن
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 ml-1" /> استعادة من ملف على جهازي
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        <div>
          <p className="text-sm font-medium mb-2">أو الاستعادة من نسخة محفوظة في السيرفر:</p>
          {serverBackups.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد نسخ محفوظة في السيرفر بعد.</p>
          ) : (
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {serverBackups.map((b: { id: number; kind: string; createdAt: string }) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {fmtDT(b.createdAt)}
                    <span className="text-xs text-muted-foreground mr-2">({b.kind === "auto" ? "تلقائية" : "يدوية"})</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "server", id: b.id, label: `نسخة السيرفر بتاريخ ${fmtDT(b.createdAt)}` })}>
                    استعادة
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Strong confirmation */}
      <Dialog open={confirm != null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">تأكيد استعادة البيانات</DialogTitle>
            <DialogDescription>
              سيتم <b>حذف بيانات مكتبك الحالية بالكامل</b> (المعتمرون، التأشيرات، الوكلاء، السندات، الحسابات)
              واستبدالها ببيانات {confirm?.label}. تُؤخذ نسخة أمان تلقائياً قبل الاستعادة، لكن هذا الإجراء
              لا يمكن التراجع عنه مباشرة. هل أنت متأكد؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>تراجع</Button>
            <Button variant="destructive" disabled={restoreMut.isPending} onClick={() => restoreMut.mutate()}>
              {restoreMut.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />} نعم، استعد البيانات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-account management (owner only): lock/unlock, change username/password.
// ---------------------------------------------------------------------------
function SubAccountsSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const { data: subs, isLoading } = useQuery({
    queryKey: ["office-subs"],
    queryFn: async () => {
      const res = await fetch("/api/office/subs", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: me?.role === "owner" || me?.role === "provider",
  });

  const [credTarget, setCredTarget] = useState<any>(null);
  const [credMode, setCredMode] = useState<"username" | "password">("username");
  const [credValue, setCredValue] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const patch = async (url: string, body: any) => {
    const res = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.json().catch(() => ({}));
      throw new Error(t?.error || "حدث خطأ");
    }
    return res.json();
  };

  const lockMut = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      patch(`/api/office/subs/${id}/lock`, { disabled }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["office-subs"] });
      toast({ title: v.disabled ? "تم إيقاف الحساب الفرعي — لن يستطيع الدخول أو العمل" : "تم تفعيل الحساب الفرعي" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const credMut = useMutation({
    mutationFn: () =>
      credMode === "username"
        ? patch(`/api/office/subs/${credTarget.id}/username`, { username: credValue.trim() })
        : patch(`/api/office/subs/${credTarget.id}/password`, { password: credValue }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office-subs"] });
      setCredTarget(null);
      setConfirmOpen(false);
      setCredValue("");
      toast({ title: credMode === "username" ? "تم تغيير اسم المستخدم" : "تم تغيير كلمة المرور" });
    },
    onError: (e: any) => {
      setConfirmOpen(false);
      toast({ variant: "destructive", title: "خطأ", description: e.message });
    },
  });

  if (me?.role !== "owner" && me?.role !== "provider") return null;

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("ar-SA-u-ca-gregory", { day: "2-digit", month: "long", year: "numeric" }) : null;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <UserCog className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold">التحكم بالحسابات الفرعية</h2>
          <p className="text-sm text-muted-foreground">إيقاف الحساب الفرعي أو تغيير بيانات دخوله.</p>
        </div>
      </div>
      <Card className="p-5">
        {isLoading ? (
          <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
        ) : !subs?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">لا توجد حسابات فرعية لهذا المكتب.</p>
        ) : (
          <div className="space-y-3">
            {subs.map((s: any) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    {s.username}
                    {s.disabled && (
                      <span className="text-xs rounded-full bg-destructive/10 text-destructive px-2 py-0.5 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> موقوف
                      </span>
                    )}
                  </p>
                  {s.credentialsChangedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      آخر تغيير لبيانات الدخول: {fmtDate(s.credentialsChangedAt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{s.disabled ? "موقوف" : "نشط"}</span>
                    <Switch
                      dir="ltr"
                      checked={!s.disabled}
                      disabled={lockMut.isPending}
                      onCheckedChange={(on) => lockMut.mutate({ id: s.id, disabled: !on })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCredTarget(s); setCredMode("username"); setCredValue(s.username); }}
                  >
                    <Pencil className="w-3.5 h-3.5 ml-1" /> اسم المستخدم
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCredTarget(s); setCredMode("password"); setCredValue(""); }}
                  >
                    <KeyRound className="w-3.5 h-3.5 ml-1" /> كلمة المرور
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Change credentials dialog */}
      <Dialog open={credTarget != null && !confirmOpen} onOpenChange={(o) => { if (!o) setCredTarget(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {credMode === "username" ? "تغيير اسم المستخدم" : "تغيير كلمة المرور"} — {credTarget?.username}
            </DialogTitle>
            <DialogDescription>سيستخدم الموظف البيانات الجديدة في تسجيل الدخول القادم.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{credMode === "username" ? "اسم المستخدم الجديد" : "كلمة المرور الجديدة"}</Label>
            <Input
              value={credValue}
              onChange={(e) => setCredValue(e.target.value)}
              type={credMode === "password" ? "password" : "text"}
              dir="ltr"
              className="text-left"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCredTarget(null)}>إلغاء</Button>
            <Button
              disabled={!credValue.trim() || (credMode === "password" && credValue.length < 4)}
              onClick={() => setConfirmOpen(true)}
            >
              متابعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Responsibility warning */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">تنبيه هام</DialogTitle>
            <DialogDescription>
              أنت على وشك تغيير {credMode === "username" ? "اسم المستخدم" : "كلمة المرور"} للحساب الفرعي
              «{credTarget?.username}». هذا التغيير يتم على مسؤوليتك الخاصة، وسيفقد الموظف القدرة على الدخول
              بالبيانات القديمة فوراً. تأكد من إبلاغه بالبيانات الجديدة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>تراجع</Button>
            <Button variant="destructive" disabled={credMut.isPending} onClick={() => credMut.mutate()}>
              {credMut.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />} تأكيد التغيير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
