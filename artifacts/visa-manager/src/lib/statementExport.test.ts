// Coverage for the account-statement Excel export (statementExport.ts).
// This export was rewritten from `xlsx` to `exceljs` for security reasons;
// nothing else caught a regression here before a customer opened a broken
// file, so this asserts the row-building logic (header, opening balance,
// per-entry rows, totals) and the generated workbook's RTL view.
//
// Run with: `pnpm --filter @workspace/visa-manager test`

import assert from "node:assert/strict";
import test from "node:test";

import { buildLedgerRows, buildLedgerWorkbook, nt } from "./statementExport";

const sampleLedger = {
  opening: 500,
  from: "2026-01-01",
  entries: [
    { kind: "فاتورة", date: "2026-01-05", description: "تأشيرة عمل", debit: 1000, credit: 0 },
    { kind: "دفعة", date: "2026-01-10", description: "دفعة نقدية", debit: 0, credit: 300 },
    { kind: "فاتورة", date: "2026-01-15", description: "تأشيرة زيارة", debit: 200, credit: 0 },
  ],
};

test("buildLedgerRows: header row matches the expected ledger columns", () => {
  const { header } = buildLedgerRows(sampleLedger);
  assert.deepEqual(header, [
    "نوع الحركة",
    "التاريخ",
    "البيان",
    "مدين (عليه)",
    "دائن (له)",
    "الرصيد بعد العملية",
  ]);
});

test("buildLedgerRows: opening balance row reflects the ledger's starting balance", () => {
  const { rows } = buildLedgerRows(sampleLedger);
  const openingRow = rows[0];
  assert.equal(openingRow[0], "الرصيد الافتتاحي");
  assert.equal(openingRow[2], "رصيد ما قبل الفترة");
  // opening = 500 > 0 => "عليه" (owed)
  assert.equal(openingRow[5], "500 (عليه)");
});

test("buildLedgerRows: one row per entry with correct running balance", () => {
  const { rows } = buildLedgerRows(sampleLedger);
  // rows[0] is the opening row, entries start at rows[1]
  const [row1, row2, row3] = rows.slice(1, 4);

  assert.equal(row1[0], "فاتورة");
  assert.equal(row1[2], "تأشيرة عمل");
  assert.equal(row1[3], 1000);
  assert.equal(row1[4], "");
  // running balance: 500 + 1000 = 1500
  assert.equal(row1[5], "1500 (عليه)");

  assert.equal(row2[0], "دفعة");
  assert.equal(row2[3], "");
  assert.equal(row2[4], 300);
  // running balance: 1500 - 300 = 1200
  assert.equal(row2[5], "1200 (عليه)");

  assert.equal(row3[0], "فاتورة");
  assert.equal(row3[3], 200);
  // running balance: 1200 + 200 = 1400
  assert.equal(row3[5], "1400 (عليه)");
});

test("buildLedgerRows: totals row sums debit/credit and closes with the final balance", () => {
  const { rows } = buildLedgerRows(sampleLedger);
  const totalsRow = rows[rows.length - 2];
  const closingRow = rows[rows.length - 1];

  assert.equal(totalsRow[2], "الإجمالي");
  assert.equal(totalsRow[3], 1200); // 1000 + 200
  assert.equal(totalsRow[4], 300);
  // final = 500 + 1200 - 300 = 1400
  assert.equal(totalsRow[5], "1400 (عليه)");

  assert.equal(closingRow[2], `عليكم مبلغ ${nt(1400)}`);
  assert.equal(closingRow[5], "العملة: ريال سعودي");
});

test("buildLedgerRows: fully settled ledger reports مسدَّد with no dues", () => {
  const settled = {
    opening: 100,
    entries: [{ kind: "دفعة", date: "2026-01-02", description: "سداد كامل", debit: 0, credit: 100 }],
  };
  const { rows } = buildLedgerRows(settled);
  const totalsRow = rows[rows.length - 2];
  const closingRow = rows[rows.length - 1];
  assert.equal(totalsRow[5], "0 (مسدَّد)");
  assert.equal(closingRow[2], "الرصيد مسدَّد بالكامل — لا مستحقات");
});

test("buildLedgerRows: negative balance uses له label (credit owed to the party)", () => {
  const credit = {
    opening: 0,
    entries: [{ kind: "دفعة", date: "2026-01-02", description: "دفعة زائدة", debit: 0, credit: 250 }],
  };
  const { rows } = buildLedgerRows(credit);
  const entryRow = rows[1];
  const closingRow = rows[rows.length - 1];
  assert.equal(entryRow[5], "250 (له)");
  assert.equal(closingRow[2], `لكم مبلغ ${nt(250)}`);
});

test("buildLedgerRows: missing/malformed debit, credit, and opening values default to zero", () => {
  const messy = {
    opening: "not-a-number",
    entries: [
      { kind: "فاتورة", date: "2026-01-03", description: "بدون قيم", debit: undefined, credit: null },
    ],
  };
  const { rows } = buildLedgerRows(messy);
  const openingRow = rows[0];
  const entryRow = rows[1];
  assert.equal(openingRow[5], "0 (مسدَّد)");
  assert.equal(entryRow[3], "");
  assert.equal(entryRow[4], "");
  assert.equal(entryRow[5], "0 (مسدَّد)");
});

test("buildLedgerWorkbook: generates a workbook with right-to-left view enabled", async () => {
  const wb = await buildLedgerWorkbook(sampleLedger, "شركة الاختبار", "2026-01-01", "2026-01-31", "agent");
  const ws = wb.getWorksheet("كشف الحساب");
  assert.ok(ws, "expected the ledger worksheet to exist");
  assert.equal(ws!.views?.[0]?.rightToLeft, true);
});

test("buildLedgerWorkbook: worksheet rows match title, period, header, and ledger rows in order", async () => {
  const wb = await buildLedgerWorkbook(sampleLedger, "شركة الاختبار", "2026-01-01", "2026-01-31", "agent");
  const ws = wb.getWorksheet("كشف الحساب")!;
  const { header, rows } = buildLedgerRows(sampleLedger);

  // row 1: title, row 2: period, row 3: blank, row 4: header, then data rows
  assert.match(String(ws.getRow(1).getCell(1).value), /كشف حساب تفصيلي للوكيل: شركة الاختبار/);
  assert.match(String(ws.getRow(2).getCell(1).value), /خلال الفترة من/);
  assert.deepEqual(
    ws.getRow(4).values?.slice(1),
    header,
  );
  for (let i = 0; i < rows.length; i++) {
    const sheetRow = ws.getRow(5 + i).values?.slice(1) ?? [];
    assert.deepEqual(sheetRow, rows[i]);
  }
  // total row count: title + period + blank + header + rows
  assert.equal(ws.rowCount, 4 + rows.length);
});

test("buildLedgerWorkbook: xlsx roundtrip preserves rows and RTL setting (workbook isn't corrupted)", async () => {
  const wb = await buildLedgerWorkbook(sampleLedger, "شركة الاختبار", undefined, undefined, "client");
  const buffer = await wb.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 0, "expected a non-empty xlsx buffer");

  const ExcelJS = (await import("exceljs")).default;
  const roundtripped = new ExcelJS.Workbook();
  await roundtripped.xlsx.load(buffer as any);
  const ws = roundtripped.getWorksheet("كشف الحساب");
  assert.ok(ws, "expected the ledger worksheet to survive a write/read roundtrip");
  assert.equal(ws!.views?.[0]?.rightToLeft, true);
  assert.match(String(ws!.getRow(1).getCell(1).value), /للعميل: شركة الاختبار/);
});
