import { useState, useEffect, useRef } from "react";
import { useGetOfficeSettings, useUpdateOfficeSettings, getGetOfficeSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, Upload, X } from "lucide-react";

export default function OfficePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetOfficeSettings();
  const update = useUpdateOfficeSettings({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetOfficeSettingsQueryKey() });
        // Cache logo for login page
        if (data.officeLogo) localStorage.setItem("oboor-last-logo", data.officeLogo);
        else localStorage.removeItem("oboor-last-logo");
        toast({ title: "تم حفظ الإعدادات" });
      },
      onError: () => toast({ title: "خطأ في الحفظ", variant: "destructive" }),
    },
  });

  const [form, setForm] = useState({
    officeName: "", officePhone: "", officePhone2: "", officeAddress: "",
    officeLogo: null as string | null, stampImage: null as string | null, signatureImage: null as string | null,
    whatsappUmrahTemplate: "", whatsappOtherTemplate: "", configured: true,
  });

  useEffect(() => {
    if (settings) setForm({ officeName: settings.officeName ?? "", officePhone: settings.officePhone ?? "", officePhone2: settings.officePhone2 ?? "", officeAddress: settings.officeAddress ?? "", officeLogo: settings.officeLogo ?? null, stampImage: settings.stampImage ?? null, signatureImage: settings.signatureImage ?? null, whatsappUmrahTemplate: settings.whatsappUmrahTemplate ?? "", whatsappOtherTemplate: settings.whatsappOtherTemplate ?? "", configured: true });
  }, [settings]);

  function f(key: string) {
    return (v: string) => setForm((prev) => ({ ...prev, [key]: v }));
  }

  function handleImageUpload(key: "officeLogo" | "stampImage" | "signatureImage", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // Resize to max 800px and convert to JPEG for storage efficiency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setForm((prev) => ({ ...prev, [key]: dataUrl }));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  if (isLoading) return <AppLayout><div className="p-6 text-center text-muted-foreground">جاري التحميل...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">إعدادات المكتب</h1>
          <Button onClick={() => update.mutate({ data: form as any })} disabled={update.isPending}>
            <Save className="w-4 h-4 ml-2" />حفظ التغييرات
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Info */}
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">بيانات المكتب</h2>
            <div className="space-y-1.5">
              <Label>اسم المكتب</Label>
              <Input value={form.officeName} onChange={(e) => f("officeName")(e.target.value)} placeholder="مكتب السفريات..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الهاتف الرئيسي</Label>
                <Input value={form.officePhone} onChange={(e) => f("officePhone")(e.target.value)} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-1.5">
                <Label>الهاتف الثاني</Label>
                <Input value={form.officePhone2} onChange={(e) => f("officePhone2")(e.target.value)} dir="ltr" className="text-left" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>العنوان</Label>
              <Input value={form.officeAddress} onChange={(e) => f("officeAddress")(e.target.value)} />
            </div>
          </Card>

          {/* Images */}
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">الصور والشعارات</h2>
            <ImageField label="شعار المكتب" value={form.officeLogo} onUpload={(e) => handleImageUpload("officeLogo", e)} onClear={() => setForm((p) => ({ ...p, officeLogo: null }))} />
            <ImageField label="صورة الختم" value={form.stampImage} onUpload={(e) => handleImageUpload("stampImage", e)} onClear={() => setForm((p) => ({ ...p, stampImage: null }))} />
            <ImageField label="صورة التوقيع" value={form.signatureImage} onUpload={(e) => handleImageUpload("signatureImage", e)} onClear={() => setForm((p) => ({ ...p, signatureImage: null }))} />
          </Card>

          {/* WhatsApp Templates */}
          <Card className="p-5 space-y-4 lg:col-span-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">قوالب رسائل واتساب</h2>
            <p className="text-xs text-muted-foreground">المتغيرات المتاحة: {"{name}"} للاسم، {"{passport}"} لرقم الجواز</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>قالب العمرة</Label>
                <textarea className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-y" value={form.whatsappUmrahTemplate} onChange={(e) => f("whatsappUmrahTemplate")(e.target.value)} placeholder="مرحباً {name}..." />
              </div>
              <div className="space-y-1.5">
                <Label>قالب التأشيرات الأخرى</Label>
                <textarea className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-y" value={form.whatsappOtherTemplate} onChange={(e) => f("whatsappOtherTemplate")(e.target.value)} placeholder="مرحباً {name}..." />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function ImageField({ label, value, onUpload, onClear }: { label: string; value: string | null; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 border rounded-md bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
        {value ? <img src={value} alt={label} className="w-full h-full object-contain" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium mb-1">{label}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
            <Upload className="w-3 h-3 ml-1" />رفع صورة
          </Button>
          {value && <Button variant="ghost" size="sm" onClick={onClear} className="text-destructive"><X className="w-3 h-3" /></Button>}
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onUpload} />
      </div>
    </div>
  );
}
