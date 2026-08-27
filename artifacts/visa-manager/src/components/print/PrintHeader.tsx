// Unified print header used across every printable document
// (receipts, cash vouchers, account statements).
// Layout: office info on the right, big logo centered, document details on the left.

const SUBTITLE_FALLBACK = "للنقل والسفريات والسياحة";

export interface PrintOffice {
  officeName?: string | null;
  officeLogo?: string | null;
  officePhone?: string | null;
  officePhone2?: string | null;
  officeAddress?: string | null;
}

export function PrintHeader({
  office,
  fallbackName = "المكتب",
  details,
}: {
  office: PrintOffice | null | undefined;
  fallbackName?: string;
  /** Lines shown on the left side (e.g. رقم السند، التاريخ) */
  details?: { label: string; value: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-[hsl(43,65%,52%)] pb-3">
      {/* Office info — right (first in RTL) */}
      <div className="text-right min-w-0 flex-1">
        <p className="text-lg font-bold text-[hsl(220,40%,18%)] leading-tight">
          {office?.officeName || fallbackName}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{SUBTITLE_FALLBACK}</p>
        {office?.officeAddress && <p className="text-xs text-gray-600 mt-0.5">{office.officeAddress}</p>}
        {(office?.officePhone || office?.officePhone2) && (
          <p className="text-xs text-gray-600 mt-0.5" dir="ltr">
            {[office?.officePhone, office?.officePhone2].filter(Boolean).join(" — ")}
          </p>
        )}
      </div>

      {/* Logo — centered, prominent */}
      <div className="flex-shrink-0 flex items-center justify-center">
        {office?.officeLogo && (
          <img src={office.officeLogo} alt="شعار المكتب" className="h-24 w-24 object-contain" />
        )}
      </div>

      {/* Document details — left (last in RTL) */}
      <div className="text-left text-xs text-gray-600 flex-1 space-y-1">
        {(details ?? []).map((d) => (
          <p key={d.label}>
            {d.label}: <span className="font-medium text-gray-800">{d.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Unified print footer — repeats on every printed page via `.print-repeat-header`'s <tfoot>. */
export function PrintFooter({ office, fallbackName = "المكتب" }: { office: PrintOffice | null | undefined; fallbackName?: string }) {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  // Plain numeric DD/MM/YYYY HH:mm with Western digits — no Intl/locale
  // formatting here, since ar-* locales can still inject Arabic-Indic
  // digits or RTL-mark characters depending on options.
  const stamp = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-300 pt-2 mt-3 text-[10px] text-gray-400">
      <span>{office?.officeName || fallbackName} — نظام عبور الذكي</span>
      <span dir="ltr">{stamp}</span>
    </div>
  );
}

/** Transparent office-logo watermark behind the document. Parent must be `relative overflow-hidden`. */
export function PrintWatermark({ logo }: { logo?: string | null }) {
  if (!logo) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
      <img src={logo} alt="" className="w-[70%] max-w-[420px] opacity-[0.06] object-contain" />
    </div>
  );
}
