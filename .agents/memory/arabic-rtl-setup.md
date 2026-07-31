---
name: Arabic RTL App Setup
description: Key patterns for building fully Arabic RTL web apps in the react-vite scaffold.
---

**Rule:** Arabic apps need consistent RTL setup across HTML, CSS, and component level.

**Why:** The default scaffold is LTR. Without explicit RTL setup, Arabic text looks reversed, flex layouts go the wrong direction, and forms feel broken.

**How to apply:**
1. Add `dir="rtl"` to the root `<div>` in `App.tsx` or the body in `index.html`
2. Use an Arabic font (Tajawal, Cairo, Noto Kufi Arabic) — add as `@import url(...)` as the VERY FIRST line in `index.css` before `@import "tailwindcss"`
3. For number display: use `toLocaleString('ar-YE')` or just comma-formatted numbers — not Arabic-Indic numerals in financial apps
4. Phone numbers and passport numbers should use `dir="ltr"` inline to display correctly
5. Form inputs for IDs/numbers should have `dir="ltr" className="text-left"` to show LTR content in an RTL form
6. Table column order is naturally reversed in RTL — design columns right-to-left
