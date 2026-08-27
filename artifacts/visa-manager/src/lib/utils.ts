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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Plain numeric DD/MM/YYYY with Western (0-9) digits, built manually rather
// than via Intl/toLocaleDateString: any ar-* locale (including the
// nu-latn/ca-gregory variants) still injects invisible RTL-mark characters
// and can fall back to Arabic month names or Arabic-Indic digits depending
// on the options passed, which is exactly what this app must never show.
export function formatDate(s: string | null | undefined): string {
  const d = parseDate(s);
  if (!d) return s ?? "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(s: string | null | undefined): string {
  const d = parseDate(s);
  if (!d) return s ?? "—";
  return `${formatDate(s)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
