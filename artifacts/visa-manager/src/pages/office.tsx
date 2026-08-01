import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, X } from "lucide-react";

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
  const [firstRunOpen, setFirstRunOpen] = useState(false);
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
        whatsappUmrahTemplate: settings.whatsappUmrahTemplate ?? "",
        whatsappOtherTemplate: settings.whatsappOtherTemplate ?? "",
      });
      setLogo(settings.officeLogo ?? null);
      setStamp(settings.stampImage ?? null);
      setSignature(settings.signatureImage ?? null);
      if (settings.configured === false) setFirstRunOpen(true);
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
      setFirstRunOpen(false);
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
            <Label>توقيع المستلم (يظهر في السند)</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {signature ? <img src={signature} alt="توقيع المستلم" className="w-full h-full object-contain" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
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
              <p className="text-xs text-muted-foreground">{"{office} · {name} · {days}"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>قالب رسالة واتساب — تأشيرات أخرى</Label>
              <Textarea className="min-h-[100px] resize-y" value={form.whatsappOtherTemplate} onChange={(e) => set("whatsappOtherTemplate")(e.target.value)} />
              <p className="text-xs text-muted-foreground">{"{office} · {name} · {visaType}"}</p>
            </div>
          </Card>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>حفظ</Button>
        </div>
      </div>

      {/* First-run dialog */}
      <Dialog open={firstRunOpen} onOpenChange={setFirstRunOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>مرحباً — إعداد بيانات المكتب</DialogTitle>
            <DialogDescription>
              أدخل بيانات مكتبك لتظهر في السندات ورسائل واتساب. يمكنك تعديلها لاحقاً من «بيانات المكتب».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFirstRunOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
