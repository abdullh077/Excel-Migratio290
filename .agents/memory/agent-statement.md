---
name: Agent accounts & statement (كشف الحساب)
description: How agents/payments/ledger link to transactions and who can see them
---
- Agents (agents table) link to transactions **by the text `agent` field** in umrah_clients/other_visas — no FK. Renaming an agent re-tags both tables to keep the link; deleting keeps transactions under the old name.
- Balance convention: `balance = totalSales − paidFrom + paidTo`; positive = the agent owes the office ("عليه").
- Financial endpoints (`/statement/*`) are owner+provider only (`requireOwner`); only `/statement/agent-names` is open to subs (`requireOffice`) for the datalist pickers in umrah/visas forms.
- Ledger (ledger_entries) is general office income/expense; monthly summary joins tx months with ledger months (FULL OUTER JOIN on YYYY-MM).
