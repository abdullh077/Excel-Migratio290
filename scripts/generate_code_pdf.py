#!/usr/bin/env python3
"""Generate a syntax-highlighted PDF of the whole project source code.
Handles Arabic string/comment content with proper reshaping + bidi."""
import os, datetime
from fpdf import FPDF
from pygments import lex
from pygments.lexers import get_lexer_for_filename, guess_lexer, TextLexer
from pygments.token import (Comment, Keyword, Name, String, Number, Operator,
                            Generic, Error)
import arabic_reshaper
from bidi.algorithm import get_display

ROOT = "."
ALLOW = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html",
         ".json", ".sql", ".toml", ".sh", ".md"}
EXCL = {"node_modules", ".git", "dist", "build", ".local", ".agents", "release",
        ".cache", "mockup-sandbox", ".pnpm", "coverage", ".upm", ".config",
        ".vscode", ".idea"}
SKIP = {"pnpm-lock.yaml", "package-lock.json"}

MONO   = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
MONO_I = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Oblique.ttf"
ARABIC = "/tmp/pdf_fonts/Amiri-Regular.ttf"

FS = 6.8          # code font size
LH = 3.3          # line height mm
LM = 10           # left margin
RM = 10
GUT = 12          # line-number gutter
PAGE_W = 210
USABLE_R = PAGE_W - RM
CODE_X = LM + GUT


def has_arabic(s):
    return any("\u0600" <= c <= "\u06FF" or "\u0750" <= c <= "\u077F"
               or "\uFB50" <= c <= "\uFDFF" or "\uFE70" <= c <= "\uFEFF" for c in s)


def shape(s):
    return get_display(arabic_reshaper.reshape(s))


def tok_color(t):
    if t in Comment: return (106, 115, 125)
    if t in Keyword: return (215, 58, 73)
    if t in String: return (3, 47, 98)
    if t in Number: return (0, 92, 197)
    if t in Name.Function or t in Name.Class or t in Name.Decorator: return (111, 66, 193)
    if t in Name.Tag: return (34, 134, 58)
    if t in Name.Attribute: return (111, 66, 193)
    if t in Name.Builtin: return (0, 92, 197)
    if t in Operator: return (215, 58, 73)
    if t in Generic.Heading or t in Generic.Subheading: return (0, 92, 197)
    if t in Error: return (203, 36, 49)
    return (36, 41, 46)


def collect():
    out = []
    total = 0
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in EXCL]
        for f in fn:
            if f in SKIP or os.path.splitext(f)[1] not in ALLOW:
                continue
            p = os.path.join(dp, f)
            try:
                n = sum(1 for _ in open(p, encoding="utf-8", errors="ignore"))
            except Exception:
                n = 0
            out.append(p)
            total += n
    out.sort(key=lambda p: (p[2:] if p.startswith("./") else p).lower())
    return out, total


def get_lexer(path, code):
    try:
        return get_lexer_for_filename(path, stripnl=False)
    except Exception:
        try:
            return guess_lexer(code)
        except Exception:
            return TextLexer()


def tokens_by_line(code, lexer):
    line = []
    for tok, val in lex(code, lexer):
        parts = val.split("\n")
        for i, part in enumerate(parts):
            if i > 0:
                yield line
                line = []
            if part:
                line.append((tok, part))
    yield line


class PDF(FPDF):
    def footer(self):
        self.set_y(-8)
        self.set_font("mono", "", 7)
        self.set_text_color(160, 160, 160)
        self.cell(0, 5, str(self.page_no()), align="C")


def new_page_if_needed(pdf, need):
    if pdf.get_y() + need > pdf.h - 12:
        pdf.add_page()


def draw_header(pdf, rel):
    pdf.ln(2.5)
    new_page_if_needed(pdf, 9)
    y = pdf.get_y()
    pdf.set_fill_color(23, 37, 61)
    pdf.rect(LM, y, PAGE_W - LM - RM, 6.2, "F")
    pdf.set_fill_color(184, 134, 11)
    pdf.rect(LM, y, 1.6, 6.2, "F")
    pdf.set_xy(LM + 3, y + 0.2)
    pdf.set_font("mono", "B", 8)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(PAGE_W - LM - RM - 4, 5.8, rel)
    pdf.set_xy(LM, y + 7.5)


def draw_code(pdf, rel, code):
    lexer = get_lexer(rel, code)
    draw_header(pdf, rel)
    lineno = 0
    for toks in tokens_by_line(code, lexer):
        lineno += 1
        if pdf.get_y() + LH > pdf.h - 12:
            pdf.add_page()
        y = pdf.get_y()
        # line number
        pdf.set_font("mono", "", FS - 0.6)
        pdf.set_text_color(185, 190, 200)
        pdf.set_xy(LM, y)
        pdf.cell(GUT - 2, LH, str(lineno), align="R")
        x = CODE_X
        for tok, val in toks:
            val = val.replace("\t", "    ")
            col = tok_color(tok)
            if has_arabic(val):
                font, style, disp = "ar", "", shape(val)
            else:
                font, style, disp = "mono", ("I" if tok in Comment else ""), val
            pdf.set_font(font, style, FS)
            pdf.set_text_color(*col)
            w = pdf.get_string_width(disp)
            if x + w <= USABLE_R:
                pdf.set_xy(x, y)
                pdf.cell(w, LH, disp)
                x += w
            else:
                for ch in disp:
                    cw = pdf.get_string_width(ch)
                    if x + cw > USABLE_R:
                        y += LH
                        if y + LH > pdf.h - 12:
                            pdf.add_page()
                            y = pdf.get_y()
                        x = CODE_X
                    pdf.set_xy(x, y)
                    pdf.cell(cw, LH, ch)
                    x += cw
        pdf.set_xy(LM, y + LH)


def main():
    files, total = collect()
    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(False)
    pdf.set_margins(LM, 10, RM)
    pdf.add_font("mono", "", MONO)
    pdf.add_font("mono", "B", MONO_B)
    pdf.add_font("mono", "I", MONO_I)
    ar_ok = os.path.exists(ARABIC)
    if ar_ok:
        pdf.add_font("ar", "", ARABIC)
    else:
        pdf.add_font("ar", "", MONO)  # fallback (no shaping)

    # ---- cover ----
    pdf.add_page()
    pdf.set_y(95)
    pdf.set_font("ar", "", 26)
    pdf.set_text_color(23, 37, 61)
    pdf.cell(0, 14, shape("النظام الكامل لإدارة التأشيرات"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("mono", "B", 16)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 10, "Visa Management System", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("mono", "", 11)
    pdf.cell(0, 8, "Full Source Code", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    pdf.set_draw_color(184, 134, 11)
    pdf.set_line_width(0.5)
    pdf.line(70, pdf.get_y(), 140, pdf.get_y())
    pdf.ln(6)
    pdf.set_font("mono", "", 10)
    pdf.set_text_color(110, 110, 110)
    pdf.cell(0, 7, f"{len(files)} files   -   {total:,} lines of code", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, "Generated " + datetime.date.today().isoformat(), align="C", new_x="LMARGIN", new_y="NEXT")

    # ---- index ----
    pdf.add_page()
    pdf.set_font("mono", "B", 13)
    pdf.set_text_color(23, 37, 61)
    pdf.cell(0, 9, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("mono", "", 7.5)
    pdf.set_text_color(50, 50, 50)
    for p in files:
        rel = p[2:] if p.startswith("./") else p
        if pdf.get_y() + 4 > pdf.h - 12:
            pdf.add_page()
        pdf.cell(0, 3.9, rel, new_x="LMARGIN", new_y="NEXT")

    # ---- files ----
    for p in files:
        rel = p[2:] if p.startswith("./") else p
        try:
            code = open(p, encoding="utf-8", errors="replace").read()
        except Exception as e:
            code = f"<<could not read: {e}>>"
        code = code.replace("\r\n", "\n").replace("\r", "\n")
        draw_code(pdf, rel, code)

    os.makedirs("deliverables", exist_ok=True)
    out = "deliverables/visa-manager-source-code.pdf"
    pdf.output(out)
    print("WROTE", out, os.path.getsize(out), "bytes,", pdf.page_no(), "pages, arabic_font=", ar_ok)


if __name__ == "__main__":
    main()
