---
name: Agent accounts & statement (كشف الحساب)
description: How agents/payments/ledger link to transactions and who can see them
---
- Agents (agents table) link to transactions **by the text `agent` field** in umrah_clients/other_visas — no FK. Renaming an agent re-tags both tables to keep the link; deleting keeps transactions under the old name.
- Balance convention (منذ 2026-08-03، حساب الوكيل صار على أساس الشراء لا البيع): `balance = opening + transferred + paidTo − totalPurchases − paidFrom`; موجب = عليه للمكتب، سالب = الباقي له. البيع والربح والعميل لا يظهرون في كشف الوكيل إطلاقاً؛ الوكيل لا يظهر في كشف العميل.
- Name matching uses `btrim() = btrim()` in statement queries, and umrah/visas POST/PUT trim clientName/client/agent — stray spaces were silently dropping transactions from agent statements.
- Financial endpoints (`/statement/*`) are owner+provider only (`requireOwner`); only `/statement/agent-names` is open to subs (`requireOffice`) for the datalist pickers in umrah/visas forms.
- Ledger (ledger_entries) is general office income/expense; monthly summary joins tx months with ledger months (FULL OUTER JOIN on YYYY-MM).

## Client statement vouchers (2026-08-01)
Client balance = Σ(sale − receivedFromClient) + voucherPayments − voucherReceipts.
Only standalone client vouchers count: partyType <> 'agent' AND agent_payment_id IS NULL — agent-linked vouchers stay on the agent statement (double-count guard).
Voucher-only party names do NOT create client rows in the list; they must match a transaction client or a manual client account.
Ledger refs: V-/R- for transactions, S- for vouchers (receipt=credit, payment=debit).

## تحديث 2026-08-02
- إنشاء السند من الواجهة يتطلب الآن ربطاً بوكيل أو عميل (Select بصيغة "type|name")، حُذف حقل اسم الطرف الحر؛ الخلفية ما زالت تقبل partyType "other" للتوافق.
- POST /vouchers في الخلفية يستدعي ensureAgent / ensureClientAccount حسب partyType — أي سند يُنشئ الحساب تلقائياً.
- القيد الافتتاحي صار Dialog داخل تبويب السندات (لا تبويب مستقل).
- عمود "المرجع" حُذف من LedgerTable وتصدير Excel.
- الطباعة: @page A4، ترويسة المكتب تتكرر بكل صفحة عبر print-repeat-header (table/thead)، لا أشرطة تمرير في المطبوعات.
