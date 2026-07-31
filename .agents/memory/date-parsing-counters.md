---
name: Date parsing for countdown counters
description: Why day counters showed NaN and the rule for parsing stored date strings
---
Rule: any date string coming from the DB (SQLite TEXT or API) must be parsed defensively — accept YYYY-MM-DD, ISO with time, and DD/MM/YYYY — and return null (hide the counter) instead of NaN when unparseable.

**Why:** the Umrah remaining-days counter showed "NaN يوم" after a strict `split("-")` parser assumed YYYY-MM-DD; real data contained other formats from older builds.

**How to apply:** use/extend `localMidnight()` in visa-manager `lib/office.ts`; all counter helpers must return `number | null` and callers must skip rendering on null.
