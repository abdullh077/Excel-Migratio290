---
name: Code-to-PDF with Arabic (fpdf2)
description: Generating a syntax-highlighted source-code PDF that renders Arabic strings correctly
---

# Code-to-PDF with Arabic

Approach that worked for exporting the whole repo as a highlighted PDF: **Pygments** (tokenize) + **fpdf2**
(render, pure-python, no system deps) + **arabic-reshaper** + **python-bidi** for Arabic runs inside code.
Generator lives at `scripts/generate_code_pdf.py`.

**Key gotchas:**
- fpdf2 does **no** OpenType shaping. arabic-reshaper outputs Arabic *presentation forms* (U+FE70–FEFF), so
  the chosen font must contain those glyphs. **Tajawal / Noto Sans Arabic do NOT** (they rely on shaping) →
  Arabic renders blank. **Amiri DOES** (140/144 presentation forms) → use Amiri for Arabic.
- Use a separate mono font (DejaVu Sans Mono at `/usr/share/fonts/truetype/dejavu/`) for code, switch to the
  Arabic font only for runs containing Arabic; wrap with pixel-width (`get_string_width`) since Arabic isn't
  monospace.
- No chromium/weasyprint/wkhtmltopdf/pandoc/latex on the box → browser/HTML→PDF paths are unavailable.
- Environment `pip3 install` needs `--user --break-system-packages` (site-packages is read-only nix store).
- Exclude build output (`release/`, chromium LICENSES html were ~272k lines each), generated clients, and
  `node_modules`, or the PDF explodes to thousands of pages.
