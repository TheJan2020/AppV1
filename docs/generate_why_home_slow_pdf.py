#!/usr/bin/env python3
"""Shareable, lay-person explanation of why the Home screen feels slow.

Only the steps that the user can actually feel. No fast internals, no blame.
"""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parent / "Why_the_Home_Screen_Takes_Time.pdf"

NAVY = colors.HexColor("#1B1B2F")
PURPLE = colors.HexColor("#6D28D9")
SLATE = colors.HexColor("#3F3F56")
MUTED = colors.HexColor("#6B7280")
LIGHT = colors.HexColor("#F5F3FF")
WHITE = colors.white
LINE = colors.HexColor("#E5E7EB")
AMBER_BG = colors.HexColor("#FFF7ED")
AMBER = colors.HexColor("#C2410C")


def S():
    return {
        "cover": ParagraphStyle(
            "cover", fontName="Helvetica-Bold", fontSize=22, leading=28,
            textColor=NAVY, alignment=TA_CENTER, spaceAfter=8,
        ),
        "sub": ParagraphStyle(
            "sub", fontName="Helvetica", fontSize=11, leading=16,
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=4,
        ),
        "h": ParagraphStyle(
            "h", fontName="Helvetica-Bold", fontSize=13, leading=17,
            textColor=NAVY, spaceBefore=2, spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=10.5, leading=15,
            textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "bullet", fontName="Helvetica", fontSize=10.5, leading=15,
            textColor=SLATE, spaceAfter=3,
        ),
        "cell": ParagraphStyle(
            "cell", fontName="Helvetica", fontSize=9.5, leading=13, textColor=SLATE,
        ),
        "cellb": ParagraphStyle(
            "cellb", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=NAVY,
        ),
        "wh": ParagraphStyle(
            "wh", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=WHITE,
        ),
        "note": ParagraphStyle(
            "note", fontName="Helvetica", fontSize=10.5, leading=15, textColor=NAVY,
        ),
    }


def hf(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 12 * mm, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, A4[1] - 8 * mm, "Primewave  ·  Why the home screen takes time")
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 8 * mm, date.today().strftime("%d %b %Y"))
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(A4[0] / 2, 5 * mm, f"Page {doc.page}  ·  For sharing  ·  No technical background needed")
    canvas.restoreState()


def banner(title, s):
    t = Table([[Paragraph(title, s["wh"])]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PURPLE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def note_box(text, s):
    t = Table([[Paragraph(text, s["note"])]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
        ("BOX", (0, 0), (-1, -1), 0.8, AMBER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


def bullets(items, s):
    return ListFlowable(
        [ListItem(Paragraph(i, s["bullet"]), leftIndent=6, bulletColor=PURPLE) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=12,
        bulletFontSize=10,
        spaceBefore=2,
        spaceAfter=8,
    )


def simple_table(headers, rows, s, widths):
    data = [[Paragraph(h, s["cellb"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(c, s["cell"]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FAFAFC")))
    t.setStyle(TableStyle(style))
    return t


def build():
    s = S()
    story = []

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Why the home screen takes time", s["cover"]))
    story.append(Paragraph(
        "A plain-language look at what you wait for after opening the app<br/>"
        "until the home screen is fully shown.",
        s["sub"],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box(
        "This note is only about <b>waiting you can feel</b>: the logo animation, "
        "the grey placeholder blocks, then the real home screen. "
        "Small background tasks that finish in a blink are left out on purpose.",
        s,
    ))
    story.append(Spacer(1, 8 * mm))

    # What you see
    story.append(banner("What you see, in order", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "After you sign in (or open the app when already signed in), the phone "
        "does not jump straight to rooms and lights. It goes through three visible stages.",
        s["body"],
    ))
    story.append(simple_table(
        ["What you see", "About how long it can feel", "What is going on"],
        [
            [
                "1. Logo animation (Lottie)",
                "About 2 seconds, every time the app is opened from scratch",
                "The welcome animation is set to play for a minimum of 2.2 seconds, even if the phone already knows who you are.",
            ],
            [
                "2. Grey moving blocks (skeleton)",
                "This is the long wait people notice",
                "The home screen is hidden on purpose until a few large pieces of house data have arrived. Until then you only see placeholders.",
            ],
            [
                "3. Real home screen",
                "Appears all at once, then cameras may fill in a moment later",
                "Greeting, lights, scenes, locks, garage, and room cards show together. Live camera thumbnails can still be catching up.",
            ],
        ],
        s,
        [42 * mm, 48 * mm, 84 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    # Why skeleton
    story.append(banner("Why the grey blocks stay on screen", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "The app does not show Home until <b>three</b> things have finished. "
        "If one of them is slow, you keep seeing placeholders. The wait is as long as the slowest of these three.",
        s["body"],
    ))
    story.append(simple_table(
        ["What must finish", "In everyday words", "Why it can take time"],
        [
            [
                "The full house snapshot from Home Assistant",
                "The phone asks: “Tell me the current state of everything in this house.”",
                "This is usually the biggest wait. It is not “a few lights”. It is every device the house knows about — often hundreds or more — sent to the phone in one go.",
            ],
            [
                "The list of home scenes",
                "Which four scene buttons should appear (Good night, I’m home, and so on).",
                "A separate request to the house server. Home will not appear until this comes back, even if it is empty.",
            ],
            [
                "Home Access (locks and garage)",
                "Which locks and garage doors belong on the home screen.",
                "Another separate request. Home waits for this too, even if the rooms are already ready.",
            ],
        ],
        s,
        [48 * mm, 54 * mm, 72 * mm],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "So: rooms could already be ready, but if locks/garage or scenes are still coming, "
        "the whole home screen stays grey. Nothing is shown in pieces.",
        s["body"],
    ))
    story.append(Spacer(1, 4 * mm))

    # Extra work
    story.append(banner("Work that happens at the same time (you don’t see it, but it adds delay)", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "While those three waits are going on, the phone is also doing other heavy jobs. "
        "They are not what “unlocks” the home screen, but they share the same network and the same phone processor — so the grey blocks last longer.",
        s["body"],
    ))
    story.append(simple_table(
        ["What else is happening", "Why it matters to the wait"],
        [
            [
                "A full catalogue of the house layout (rooms, devices, names)",
                "Needed to draw room cards, but it is a large extra download next to the “everything snapshot”.",
            ],
            [
                "Building every room card in memory — including the Rooms tab you are not looking at",
                "The Rooms tab is hidden, but the phone still prepares that full grid (and room photos) while you are on Home. That extra work can make the phone hitch right before Home appears.",
            ],
            [
                "Camera system setup (Frigate / camera list)",
                "Home’s small camera strip needs this. The CCTV tab itself is not opened, but the camera list is still downloaded during Home load.",
            ],
            [
                "Lists used later inside a room (light types, TVs, climate, covers)",
                "You have not opened a room yet, but these lists are already being fetched. They compete with the three waits above.",
            ],
            [
                "Some of those lists are asked for twice",
                "Sensors and covers are requested two times during the same load. That is wasted time on a slow connection.",
            ],
        ],
        s,
        [72 * mm, 102 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    # What is NOT loading
    story.append(banner("What is not loading while you wait on Home", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "To be clear: the app is not opening every screen. These stay closed until you tap them.",
        s["body"],
    ))
    story.append(bullets([
        "<b>Inside a room</b> (lights, curtains, AC for that room) — only when you tap a room card.",
        "<b>CCTV full page and event history</b> — only when you open the CCTV tab. (The small home camera strip is the exception.)",
        "<b>Butler chat and voice</b> — only when you tap Butler or the microphone.",
        "<b>Settings</b> — only when you open Settings.",
    ], s))

    # After it appears
    story.append(banner("After Home appears, one more thing can still feel unfinished", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Once the grey blocks go away, greeting, scenes, locks, garage, and rooms are there. "
        "Live camera thumbnails often start a second later, because each thumbnail opens a live video view. "
        "That can make the page feel “still loading” even after the rest is visible.",
        s["body"],
    ))
    story.append(Spacer(1, 6 * mm))

    # Bottom line
    story.append(banner("In one sentence", s))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box(
        "You wait because Home is held back until a <b>full snapshot of the house</b>, "
        "plus <b>scenes</b>, plus <b>locks/garage</b> have all arrived — while the phone is also "
        "downloading layout, cameras, and room-related lists, and building a hidden Rooms grid. "
        "The logo animation adds a fixed extra 2 seconds at the start.",
        s,
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "This is how the current home load is designed. It is not a fault of the phone user, "
        "and it is not “the app doing nothing”. The wait is the house data plus a few extra jobs "
        "running together before the first real screen is allowed to show.",
        s["body"],
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="Why the home screen takes time",
        author="Primewave",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
