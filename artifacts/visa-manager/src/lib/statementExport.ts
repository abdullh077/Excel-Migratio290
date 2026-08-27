// Ledger statement Excel export logic, kept free of React/JSX and DOM-only
// APIs (other than the final file-download step) so it can be unit tested
// with a plain Node test runner. `buildLedgerRows` and `buildLedgerWorkbook`
// are the "row building" / "workbook building" layers exercised by tests;
// `exportLedgerXlsx` adds the browser-only blob/download side effects and is
// what the UI actually calls.
import ExcelJS from "exceljs";

// Exact currency formatter as production `nt`
export function nt(e: number | null | undefined): string {
  return e == null
    ? "0 ر.س"
    : e.toLocaleString("ar-SA-u-ca-gregory", {
        style: "currency",
        currency: "SAR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
}

// Exact date formatter as production `La`
export function La(e: string | null | undefined): string {
  if (!e) return "-";
  try {
    const t = new Date(e);
    if (isNaN(t.getTime())) return e;
    return t.toLocaleDateString("ar-SA-u-ca-gregory", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return e;
  }
}

export interface LedgerExportRows {
  header: string[];
  /** Row 0 is always the opening-balance row; the last row is always the totals row. */
  rows: any[][];
}

/**
 * Pure row-building logic for the ledger statement export: header labels,
 * the opening-balance row, one row per entry (running balance included),
 * and the closing totals row. No workbook/DOM concerns here so it's cheap
 * to assert against directly in tests.
 */
export function buildLedgerRows(ledger: any): LedgerExportRows {
  const opening = Number(ledger?.opening) || 0;
  let run = opening;
  const balLabel = (v: number) =>
    v > 0
      ? `${Math.abs(v)} (عليه)`
      : v < 0
        ? `${Math.abs(v)} (له)`
        : "0 (مسدَّد)";
  const header = [
    "نوع الحركة",
    "التاريخ",
    "البيان",
    "مدين (عليه)",
    "دائن (له)",
    "الرصيد بعد العملية",
  ];
  const rows: any[][] = [
    [
      "الرصيد الافتتاحي",
      ledger?.from ? La(ledger.from) : "—",
      "رصيد ما قبل الفترة",
      "",
      "",
      balLabel(opening),
    ],
  ];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of ledger?.entries ?? []) {
    const debit = Number(e.debit) || 0;
    const credit = Number(e.credit) || 0;
    run += debit - credit;
    totalDebit += debit;
    totalCredit += credit;
    rows.push([
      e.kind,
      La(e.date),
      e.description || "",
      debit || "",
      credit || "",
      balLabel(run),
    ]);
  }
  const final = opening + totalDebit - totalCredit;
  rows.push(["", "", "الإجمالي", totalDebit, totalCredit, balLabel(final)]);
  rows.push([
    "",
    "",
    final > 0
      ? `عليكم مبلغ ${nt(final)}`
      : final < 0
        ? `لكم مبلغ ${nt(-final)}`
        : "الرصيد مسدَّد بالكامل — لا مستحقات",
    "",
    "",
    "العملة: ريال سعودي",
  ]);
  return { header, rows };
}

/**
 * Builds the RTL xlsx workbook for a ledger statement. Split out from
 * `exportLedgerXlsx` so tests can inspect the generated worksheet (rows,
 * RTL view) without touching Blob/URL/document APIs.
 */
export async function buildLedgerWorkbook(
  ledger: any,
  agentName: string,
  from?: string,
  to?: string,
  entity: "agent" | "client" = "agent",
): Promise<ExcelJS.Workbook> {
  const { header, rows } = buildLedgerRows(ledger);
  const title = `كشف حساب تفصيلي ${entity === "client" ? "للعميل" : "للوكيل"}: ${agentName}`;
  const period =
    from || to
      ? `خلال الفترة من ${from ? La(from) : "البداية"} إلى ${to ? La(to) : "اليوم"}`
      : "عن كامل الفترة حتى تاريخه";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("كشف الحساب", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 16 },
    { width: 18 },
    { width: 45 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
  ];
  ws.addRow([title]);
  ws.addRow([period]);
  ws.addRow([]);
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return wb;
}

// Export ledger statement to an RTL xlsx file (same columns as LedgerTable, with opening row and totals)
export async function exportLedgerXlsx(
  ledger: any,
  agentName: string,
  from?: string,
  to?: string,
  entity: "agent" | "client" = "agent",
): Promise<void> {
  const wb = await buildLedgerWorkbook(ledger, agentName, from, to, entity);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `كشف حساب - ${agentName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
