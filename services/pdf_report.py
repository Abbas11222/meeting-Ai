"""PDF report of a finished meeting: summary, structured output and the full conversation."""
import io
import os
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ACCENT = colors.HexColor("#0f6b6b")
SOFT = colors.HexColor("#dcefee")
LINE = colors.HexColor("#c9d2d9")
MUTED = colors.HexColor("#5d6b78")

# Fonts with wide character support, tried in order. Falls back to Helvetica.
FONT_FILES = [
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]
_fonts = None


def _pick_fonts() -> tuple[str, str]:
    global _fonts
    if _fonts is None:
        _fonts = ("Helvetica", "Helvetica-Bold")
        for regular, bold in FONT_FILES:
            if os.path.exists(regular) and os.path.exists(bold):
                pdfmetrics.registerFont(TTFont("Report", regular))
                pdfmetrics.registerFont(TTFont("Report-Bold", bold))
                pdfmetrics.registerFontFamily("Report", normal="Report", bold="Report-Bold",
                                              italic="Report", boldItalic="Report-Bold")
                _fonts = ("Report", "Report-Bold")
                break
    return _fonts


def _text(value) -> str:
    """Makes text safe for the PDF paragraphs."""
    return escape(str(value or "")).replace("\n", "<br/>")


def filename(meeting: dict) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", meeting["title"]).strip("-")[:50] or "meeting"
    return f"{slug}-{meeting['date']}.pdf"


def build_meeting_pdf(meeting: dict) -> bytes:
    """`meeting` is the dictionary returned by repository.full_meeting()."""
    regular, bold = _pick_fonts()

    title = ParagraphStyle("title", fontName=bold, fontSize=22, leading=27, textColor=colors.HexColor("#14202b"))
    meta = ParagraphStyle("meta", fontName=regular, fontSize=10, leading=14, textColor=MUTED, spaceAfter=6)
    heading = ParagraphStyle("heading", fontName=bold, fontSize=13, leading=17, textColor=ACCENT,
                             spaceBefore=16, spaceAfter=6, keepWithNext=1)
    body = ParagraphStyle("body", fontName=regular, fontSize=10.5, leading=15)
    bullet = ParagraphStyle("bullet", parent=body, leftIndent=14, bulletIndent=2, spaceAfter=3)
    empty = ParagraphStyle("empty", parent=body, textColor=MUTED)
    cell = ParagraphStyle("cell", parent=body, fontSize=10, leading=13)
    cell_head = ParagraphStyle("cell_head", parent=cell, fontName=bold)
    line = ParagraphStyle("line", parent=body, spaceAfter=5)

    def none_recorded():
        return Paragraph("None recorded.", empty)

    story = [
        Paragraph(_text(meeting["title"]), title),
        Paragraph(f"{_text(meeting['date'])} &nbsp;·&nbsp; {_text(meeting['duration_min'])} min", meta),
    ]

    # Summary
    story.append(Paragraph("Summary", heading))
    story.append(Paragraph(_text(meeting["summary"]), body) if meeting["summary"]
                 else Paragraph("No summary available.", empty))

    # Topics
    story.append(Paragraph("Topics", heading))
    story.append(Paragraph(_text(", ".join(meeting["topics"])), body) if meeting["topics"] else none_recorded())

    # Decisions
    story.append(Paragraph("Decisions", heading))
    story += [Paragraph(_text(text), bullet, bulletText="•") for text in meeting["decisions"]] or [none_recorded()]

    # Action items
    story.append(Paragraph("Action items", heading))
    if meeting["action_items"]:
        rows = [[Paragraph(label, cell_head) for label in ("Task", "Owner", "Deadline", "Status")]]
        for item in meeting["action_items"]:
            rows.append([
                Paragraph(_text(item["task"]), cell),
                Paragraph(_text(item["owner"] or "Unassigned"), cell),
                Paragraph(_text(item["deadline"] or "None"), cell),
                Paragraph("Done" if item.get("done") else "Open", cell),
            ])
        table = Table(rows, colWidths=[85 * mm, 32 * mm, 30 * mm, 23 * mm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), SOFT),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)
    else:
        story.append(none_recorded())

    # Questions
    story.append(Paragraph("Questions", heading))
    story += [Paragraph(_text(text), bullet, bulletText="•") for text in meeting["questions"]] or [none_recorded()]

    # Full conversation
    story.append(Paragraph("Full conversation", heading))
    story += [
        Paragraph(f"<b>{_text(entry['speaker'])}:</b> {_text(entry['text'])}", line)
        for entry in meeting["transcript"]
    ] or [none_recorded()]

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont(regular, 9)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, 12 * mm, meeting["title"][:70])
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {document.page}")
        canvas.restoreState()

    buffer = io.BytesIO()
    SimpleDocTemplate(
        buffer, pagesize=A4, title=meeting["title"],
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=22 * mm,
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()