import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Last office logo from localStorage
  const lastLogo = localStorage.getItem("oboor-last-logo");

  const login = useLogin({
    mutation: {
      onSuccess: (data) => {
        queryClient.clear();
        localStorage.removeItem("oboor-query-cache-v1");
        setLocation("/");
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error ?? err?.message ?? "خطأ في تسجيل الدخول");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    login.mutate({ data: { username, password } });
  };

  return (
    <div dir="rtl" className="min-h-screen flex font-sans">
      {/* Right panel — brand hero */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary" />
        <img
          src="/oboor-hero.png"
          alt="نظام عبور الذكي"
          className="relative z-10 max-w-xs w-full object-contain drop-shadow-2xl"
        />
        <div className="relative z-10 mt-8 text-center px-8">
          <h1 className="text-3xl font-bold text-accent mb-2">نظام عبور الذكي</h1>
          <p className="text-white/70 text-sm">منظومة متكاملة لإدارة تأشيرات العمرة والسفر</p>
        </div>
        {/* Gold decorative line */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent" />
      </div>

      {/* Left panel — login form */}
      <div className="w-full lg:w-[420px] flex flex-col justify-center px-8 py-12 bg-background">
        <div className="max-w-sm mx-auto w-full">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            {lastLogo ? (
              <img src={lastLogo} alt="شعار المكتب" className="h-16 object-contain mb-3" />
            ) : (
              <img src="/oboor-hero.png" alt="عبور" className="h-16 object-contain mb-3" onError={(e) => (e.currentTarget.style.display = "none")} />
            )}
            <h2 className="text-xl font-bold text-primary">نظام عبور الذكي</h2>
          </div>

          {/* Office logo if available (desktop) */}
          {lastLogo && (
            <div className="hidden lg:flex justify-center mb-6">
              <img src={lastLogo} alt="شعار المكتب" className="h-14 object-contain" />
            </div>
          )}

          <h2 className="text-2xl font-bold text-foreground mb-1">تسجيل الدخول</h2>
          <p className="text-muted-foreground text-sm mb-8">أدخل بيانات حسابك للمتابعة</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                dir="ltr"
                className="text-left"
                placeholder="username"
                disabled={login.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                dir="ltr"
                className="text-left"
                placeholder="••••••••"
                disabled={login.isPending}
              />
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={login.isPending}>
              {login.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              دخول
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
