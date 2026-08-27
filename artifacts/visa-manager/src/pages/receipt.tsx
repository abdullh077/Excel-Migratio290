import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Printer, FileDown, ArrowRight } from "lucide-react";
import { fmt, formatDate } from "@/lib/utils";
import { PrintHeader } from "@/components/print/PrintHeader";
import { offlineFetch } from "@/lib/offline/offlineFetch";

const OFFICE_FALLBACK = "مكتب اللواء الغربي";
const SUBTITLE_FALLBACK = "للنقل والسفريات والسياحة";
const PHONE_FALLBACK = "771436479";

async function fetchJson(url: string) {
  const res = await offlineFetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [type, setType] = useState<"umrah" | "visa">("umrah");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    setType(t === "visa" ? "visa" : "umrah");
  }, []);

  const isUmrah = type === "umrah";

  const { data: record, isLoading } = useQuery({
    queryKey: [isUmrah ? "/api/umrah" : "/api/visas", id],
    queryFn: () => fetchJson(`/api/${isUmrah ? "umrah" : "visas"}/${id}`),
    enabled: !isNaN(id),
  });

  const { data: office } = useQuery({
    queryKey: ["/api/settings/office"],
    queryFn: () => fetchJson("/api/settings/office"),
  });

  if (isLoading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-white"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!record) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white"
      >
        <p className="text-gray-600">البيانات غير موجودة</p>
        <a href="/" className="text-primary underline">
          العودة للرئيسية
        </a>
      </div>
    );
  }

  const officeName = office?.officeName || OFFICE_FALLBACK;
  const officeLogo = office?.officeLogo || null;
  const supportPhone = office?.officePhone || PHONE_FALLBACK;
  const stampImage = office?.stampImage || null;
  const signatureImage = office?.signatureImage || null;

  const backHref = isUmrah ? "/umrah" : "/visas";
  const receiptId = "#" + String(record.id).padStart(6, "0");
  const title = "إشعار " + (isUmrah ? "(عمرة)" : "(تأشيرة)");
  const visaTypeLabel = isUmrah ? "عمرة" : record?.visaType || "—";

  const transaction = isUmrah ? "تأشيرة عمرة" : record.visaType || "—";
  const paid = isUmrah ? record.salePrice : record.receivedFromClient;
  const remaining = isUmrah ? 0 : record.clientBalance;
  const total = record.salePrice;

  return (
    <div
      dir="rtl"
      className="voucher-print statement-print-area min-h-screen bg-gray-100 font-sans"
    >
      {/* Print controls — hidden in print */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b px-4 py-3">
        <a href={backHref}>
          <Button variant="outline" size="sm">
            <ArrowRight className="w-4 h-4 ml-2" />
            العودة
          </Button>
        </a>
        <div className="print:hidden flex items-center gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 ml-2" />
            طباعة
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <FileDown className="w-4 h-4 ml-2" />
            تصدير PDF
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        <div className="relative overflow-hidden bg-white border rounded-lg shadow-sm p-8 print:shadow-none print:border-0 print:rounded-none print:p-6">
          {/* Watermark — office logo as transparent background */}
          {officeLogo && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <img
                src={officeLogo}
                alt=""
                className="w-[70%] max-w-[420px] opacity-[0.06] object-contain"
              />
            </div>
          )}
          <table className="relative w-full print-repeat-header">
            <thead>
              <tr>
                <td className="pb-6">
                  {/* Header — unified across all printable documents */}
                  <PrintHeader
                    office={{ ...office, officeName, officePhone: supportPhone }}
                    fallbackName={OFFICE_FALLBACK}
                    details={[
                      { label: "رقم السند", value: receiptId },
                      { label: "التاريخ", value: formatDate(record.createdAt) },
                    ]}
                  />
                </td>
              </tr>
            </thead>
            <tfoot>
              <tr>
                <td className="pt-4">
                  {/* Footer */}
                  <div className="text-center text-xs text-gray-400 border-t pt-4 space-y-1">
                    <p>نسعد بخدمتكم ونتمنى لكم رحلة موفقة</p>
                    <p>تمت الطباعة بواسطة نظام عبور الذكي</p>
                  </div>
                </td>
              </tr>
            </tfoot>
            <tbody>
              <tr>
                <td>
            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-primary">{title}</h2>
            </div>

            {/* Client fields */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Field label="اسم الجواز" value={record.clientName} />
              <Field label="رقم الجوال" value={record.phone} ltr />
              <Field label="رقم الجواز" value={record.passportNumber} ltr />
              <Field label="اسم العميل" value={record.client} />
              <Field label="نوع التأشيرة" value={visaTypeLabel} />
            </div>

            {/* Transactions table */}
            <table className="w-full text-sm border mb-6">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="border px-3 py-2 text-right font-medium">
                    الحركة
                  </th>
                  <th className="border px-3 py-2 text-right font-medium">
                    التفاصيل
                  </th>
                  <th className="border px-3 py-2 text-right font-medium">
                    المدفوع
                  </th>
                  <th className="border px-3 py-2 text-right font-medium">
                    المتبقي
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border px-3 py-2">{transaction}</td>
                  <td className="border px-3 py-2">
                    <div>تاريخ الإصدار: {formatDate(record.issueDate)}</div>
                    {record.transactionParty && (
                      <div>ترحيل عبر: {record.transactionParty}</div>
                    )}
                  </td>
                  <td className="border px-3 py-2" dir="ltr">
                    {fmt(paid)}
                  </td>
                  <td className="border px-3 py-2" dir="ltr">
                    {fmt(remaining)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Total */}
            <div className="flex justify-end mb-6">
              <div className="text-base font-bold">
                الإجمالي: <span dir="ltr">{fmt(total)}</span> ريال سعودي
              </div>
            </div>

            {/* Notes */}
            {record.notes && (
              <div className="mb-6 text-sm">
                <p className="font-medium text-gray-600 mb-1">ملاحظات:</p>
                <p className="text-gray-700">{record.notes}</p>
              </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 mt-12 mb-6">
              <div className="text-center">
                <div className="flex items-end justify-center gap-2 h-24 mb-1">
                  {signatureImage && (
                    <img
                      src={signatureImage}
                      alt="توقيع المكتب"
                      className="max-h-[60px] w-auto object-contain"
                    />
                  )}
                  {stampImage && (
                    <img
                      src={stampImage}
                      alt="ختم المكتب"
                      className="max-h-[70px] w-auto object-contain"
                    />
                  )}
                </div>
                <div className="border-t pt-2 text-xs text-gray-600">
                  توقيع المكتب
                </div>
              </div>
              <div className="text-center">
                <div className="h-24 mb-1" />
                <div className="border-t pt-2 text-xs text-gray-600">
                  توقيع المسلم (العميل)
                </div>
              </div>
            </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p
        className={"text-sm font-medium" + (ltr ? " text-right" : "")}
        dir={ltr ? "ltr" : undefined}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}
