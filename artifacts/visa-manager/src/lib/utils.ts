import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Try ISO
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // Try DD/MM/YYYY
  const parts = s.split("/");
  if (parts.length === 3) {
    d = new Date(`${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function daysRemaining(entryDate: string | null | undefined, stayDuration: number): number | null {
  const d = parseDate(entryDate);
  if (!d) return null;
  const elapsed = Math.floor((Date.now() - d.getTime()) / 86400000);
  return stayDuration - elapsed;
}

export function formatDate(s: string | null | undefined): string {
  const d = parseDate(s);
  if (!d) return s ?? "—";
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(s: string | null | undefined): string {
  const d = parseDate(s);
  if (!d) return s ?? "—";
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
