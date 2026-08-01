import { useParams } from "wouter";
import { useGetUmrahClient, useGetVisa, useGetOfficeSettings, getGetUmrahClientQueryKey, getGetVisaQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { fmt, formatDate, today } from "@/lib/utils";

export default function ReceiptPage() {
  const params = useParams<{ type: string; id: string }>();
  const id = Number(params.id);
  const type = params.type;

  const { data: umrahClient } = useGetUmrahClient(id, { query: { enabled: type === "umrah", queryKey: getGetUmrahClientQueryKey(id) } });
  const { data: visa } = useGetVisa(id, { query: { enabled: type === "visa", queryKey: getGetVisaQueryKey(id) } });
  const { data: settings } = useGetOfficeSettings();

  const record = type === "umrah" ? umrahClient : visa;
  if (!record) return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;

  const receiptNumber = `${type === "umrah" ? "U" : "V"}${String(id).padStart(4, "0")}`;

  return (
    <div dir="rtl" className="min-h-screen bg-white font-sans">
      {/* Print button — hidden in print */}
      <div className="no-print fixed top-4 left-4 z-10">
        <Button onClick={() => window.print()} size="sm">
          <Printer className="w-4 h-4 ml-2" />طباعة / PDF
        </Button>
      </div>

      <div className="max-w-2xl mx-auto p-8 print:p-6">
        {/* Header */}
        <div className="border-b-2 border-primary pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              {settings?.officeLogo && (
                <img src={settings.officeLogo} alt="شعار المكتب" className="h-16 object-contain mb-2" />
              )}
              <h1 className="text-base font-semibold text-primary">{settings?.officeName ?? "المكتب"}</h1>
              {settings?.officeAddress && <p className="text-xs text-gray-600 mt-0.5">{settings.officeAddress}</p>}
              {settings?.officePhone && <p className="text-xs text-gray-600" dir="ltr">{settings.officePhone}{settings.officePhone2 ? ` — ${settings.officePhone2}` : ""}</p>}
            </div>
            {/* Receipt number + date — LEFT side (start of RTL = right physically but label "left" semantically) */}
            <div className="text-left">
              <p className="text-xs text-gray-500">رقم الإشعار</p>
              <p className="text-lg font-bold text-primary" dir="ltr">{receiptNumber}</p>
              <p className="text-xs text-gray-500 mt-1">التاريخ</p>
              <p className="text-sm" dir="ltr">{formatDate(record.createdAt)}</p>
            </div>
          </div>
          <div className="mt-4 text-center">
            <h2 className="text-xl font-bold text-primary">إشعار عميل</h2>
          </div>
        </div>

        {/* Client Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <InfoRow label="اسم العميل" value={record.clientName} />
          <InfoRow label="رقم الجواز" value={record.passportNumber} ltr />
          <InfoRow label="رقم الهاتف" value={record.phone} ltr />
          <InfoRow label="الوكيل" value={record.agent} />
          <InfoRow label="تاريخ الإصدار" value={formatDate(record.issueDate)} />
          {type === "visa" && <InfoRow label="نوع التأشيرة" value={(record as any).visaType} />}
          {type === "umrah" && <InfoRow label="مدة الإقامة" value={`${(record as any).stayDuration} يوم`} />}
          {(record as any).transactionParty && <InfoRow label="جهة المعاملة" value={(record as any).transactionParty} />}
        </div>

        {/* Financial */}
        <div className="bg-gray-50 border rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-3 text-sm text-gray-700">التفاصيل المالية</h3>
          <div className="space-y-2">
            <FinRow label="سعر البيع" value={fmt(record.salePrice)} />
            {type === "visa" && (
              <>
                <FinRow label="المستلم من العميل" value={fmt((record as any).receivedFromClient)} />
                <div className="border-t pt-2">
                  <FinRow label="الرصيد المتبقي" value={fmt((record as any).clientBalance)} highlight={(record as any).clientBalance > 0} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Notes */}
        {record.notes && (
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-600 mb-1">ملاحظات:</p>
            <p className="text-sm text-gray-700 border-r-2 border-primary/30 pr-3">{record.notes}</p>
          </div>
        )}

        {/* Stamp & Signature */}
        {(settings?.stampImage || settings?.signatureImage) && (
          <div className="flex items-end justify-between mt-8 pt-4 border-t">
            {settings.stampImage && (
              <div className="text-center">
                <img src={settings.stampImage} alt="الختم" className="h-20 object-contain mx-auto" />
                <p className="text-xs text-gray-500 mt-1">الختم الرسمي</p>
              </div>
            )}
            {settings.signatureImage && (
              <div className="text-center">
                <img src={settings.signatureImage} alt="التوقيع" className="h-16 object-contain mx-auto" />
                <p className="text-xs text-gray-500 mt-1">التوقيع</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 pt-4 border-t text-center text-xs text-gray-400">
          نظام عبور الذكي — {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium" dir={ltr ? "ltr" : undefined}>{value ?? "—"}</p>
    </div>
  );
}

function FinRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${highlight ? "text-orange-600" : "text-gray-800"}`} dir="ltr">{value} ر.س</span>
    </div>
  );
}
