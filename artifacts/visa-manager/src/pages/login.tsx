import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, clearClientCaches } from "@/lib/api";
import { Loader2, Shield, ClipboardList, BarChart3, Wallet } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginValues = z.infer<typeof loginSchema>;

const WHATSAPP_HREF =
  "https://wa.me/967781332742?text=%D8%A3%D8%B1%D8%BA%D8%A8%20%D8%A8%D8%AA%D9%81%D8%B9%D9%8A%D9%84%20%D8%A3%D9%88%20%D8%AA%D8%AC%D8%AF%D9%8A%D8%AF%20%D8%A7%D8%B4%D8%AA%D8%B1%D8%A7%D9%83%20%D9%81%D9%8A%20%D9%86%D8%B8%D8%A7%D9%85%20%D8%B9%D8%A8%D9%88%D8%B1";

async function fetchBranding(): Promise<{ officeName: string; officeLogo: string }> {
  try {
    const res = await fetch("/api/settings/branding", { credentials: "include" });
    if (!res.ok) return { officeName: "", officeLogo: "" };
    const data = await res.json();
    return {
      officeName: data?.officeName ?? "",
      officeLogo: data?.officeLogo ?? "",
    };
  } catch {
    return { officeName: "", officeLogo: "" };
  }
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [officeLogo, setOfficeLogo] = useState("");

  useEffect(() => {
    let active = true;
    fetchBranding().then((b) => {
      if (active) setOfficeLogo(b.officeLogo);
    });
    return () => {
      active = false;
    };
  }, []);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: (values: LoginValues) =>
      apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await clearClientCaches();
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? err?.status;
      const serverError = err?.response?.data?.error ?? err?.data?.error;
      if (status === 403) {
        toast({
          variant: "destructive",
          title: "الحساب منتهي",
          description: serverError || "انتهت صلاحية الحساب. تواصل مع المزوّد.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "فشل تسجيل الدخول",
          description: "اسم المستخدم أو كلمة المرور غير صحيحة",
        });
      }
    },
  });

  const onSubmit = (values: LoginValues) => {
    loginMutation.mutate(values);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Hero */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-[#0a1628] flex-col items-center justify-center p-12 text-white">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(198,161,91,0.18), transparent 45%), radial-gradient(circle at 70% 70%, rgba(198,161,91,0.12), transparent 50%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          {officeLogo ? (
            <img
              src={officeLogo}
              alt="شعار المكتب"
              className="h-28 w-28 rounded-2xl object-contain bg-white/5 p-2 mb-8"
            />
          ) : (
            <svg
              width="112"
              height="112"
              viewBox="0 0 112 112"
              fill="none"
              className="mb-8"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="goldShield" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#e6c583" />
                  <stop offset="100%" stopColor="#b8923f" />
                </linearGradient>
              </defs>
              <path
                d="M56 8 L96 24 V56 C96 80 78 98 56 106 C34 98 16 80 16 56 V24 Z"
                fill="none"
                stroke="url(#goldShield)"
                strokeWidth="3"
              />
              <path
                d="M40 56 L52 68 L74 44"
                fill="none"
                stroke="url(#goldShield)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <h1 className="text-5xl font-extrabold tracking-widest text-[hsl(40,66%,60%)]">
            OBOOR
          </h1>
          <p className="mt-2 text-lg text-white/80">للتقنية والحلول الرقمية</p>
          <p className="mt-6 text-base text-white/70 leading-relaxed">
            عبور: زيادة رقمية، وجهة في الإنجاز
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 w-full">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
              <Shield className="w-5 h-5 text-[hsl(40,66%,60%)]" />
              <span className="text-sm">نظام أمان وحماية</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
              <ClipboardList className="w-5 h-5 text-[hsl(40,66%,60%)]" />
              <span className="text-sm">إدارة الطلبات</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
              <BarChart3 className="w-5 h-5 text-[hsl(40,66%,60%)]" />
              <span className="text-sm">التقارير والإحصاءات</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
              <Wallet className="w-5 h-5 text-[hsl(40,66%,60%)]" />
              <span className="text-sm">الحسابات المالية</span>
            </div>
          </div>

          <p className="mt-10 text-sm text-white/60" dir="ltr">
            771436479
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-[0.85] bg-card flex flex-col justify-center p-6 sm:p-8 md:p-16 lg:p-20 md:border-r border-border">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex flex-col items-center mb-8">
            <div className="h-20 w-20 rounded-2xl border border-border bg-white flex items-center justify-center overflow-hidden">
              <img
                src="/basmah-logo.jpeg"
                alt="بصمة إلكترونية"
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground text-center">
            تسجيل الدخول
          </h2>
          <p className="text-muted-foreground text-sm text-center mt-1 mb-8">
            الرجاء إدخال بيانات الاعتماد الخاصة بك
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم المستخدم</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="ltr"
                        className="h-12"
                        autoComplete="username"
                        placeholder="أدخل اسم المستخدم"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>كلمة المرور</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        dir="ltr"
                        className="h-12"
                        autoComplete="current-password"
                        placeholder="أدخل كلمة المرور"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-12"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "دخول"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              لتفعيل أو تجديد الاشتراك — واتساب <span dir="ltr">781332742</span>
            </a>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            جميع الحقوق محفوظة © 2026 لـ بصمة إلكترونية
          </p>
        </div>
      </div>
    </div>
  );
}
