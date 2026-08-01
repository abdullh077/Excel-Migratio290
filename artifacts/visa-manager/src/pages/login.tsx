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
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginValues = z.infer<typeof loginSchema>;

const WHATSAPP_HREF =
  "https://wa.me/967781332742?text=%D8%A3%D8%B1%D8%BA%D8%A8%20%D8%A8%D8%AA%D9%81%D8%B9%D9%8A%D9%84%20%D8%A3%D9%88%20%D8%AA%D8%AC%D8%AF%D9%8A%D8%AF%20%D8%A7%D8%B4%D8%AA%D8%B1%D8%A7%D9%83%20%D9%81%D9%8A%20%D9%86%D8%B8%D8%A7%D9%85%20%D8%B9%D8%A8%D9%88%D8%B1";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      {/* Hero — الصورة الرسمية لعبور، على خلفية كحلية مطابقة للتصميم */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-[#0d1b33] items-center justify-center">
        <img
          src="/oboor-login.jpg"
          alt="OBOOR — للسفر والسياحة والعمرة"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
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
