#!/usr/bin/env python3
"""Shareable note: leftover Home-screen pieces that never run or never show.

Only the first page after login. No blame. No tiny unused icons.
"""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
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

OUT = Path(__file__).resolve().parent / "Home_Screen_Unused_Pieces.pdf"

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
    canvas.drawString(18 * mm, A4[1] - 8 * mm, "Primewave  ·  Home screen — leftover pieces")
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 8 * mm, date.today().strftime("%d %b %Y"))
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(
        A4[0] / 2, 5 * mm,
        f"Page {doc.page}  ·  First screen after login only  ·  For sharing",
    )
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
    story.append(Paragraph("Home screen leftover pieces", s["cover"]))
    story.append(Paragraph(
        "What exists for the first page after login, but never actually shows<br/>"
        "or never actually runs.",
        s["sub"],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box(
        "This is only the <b>Home</b> screen (greeting, badges, scenes, locks/garage, "
        "room cards, camera strip). Rooms tab, CCTV, Butler, and Settings were not included. "
        "Tiny unused icons and labels are left out. Nothing here is a fault of the person using the app.",
        s,
    ))
    story.append(Spacer(1, 8 * mm))

    story.append(banner("On screen: prepared, but you cannot use it", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "These pieces are still in the Home screen. The phone prepares them, "
        "but there is no button or tap that actually uses them.",
        s["body"],
    ))
    story.append(simple_table(
        ["What it is", "What you would expect", "What actually happens"],
        [
            [
                "Voice on the greeting header",
                "A microphone next to the name, to start Butler by voice",
                "Home still sends the voice action to the header, but the header has no mic. Voice only starts from the tab bar.",
            ],
            [
                "Tap the greeting / name",
                "Open the room you are in, or switch account",
                "Those actions are ready in the page, but the header never calls them. Tapping the name does nothing on Home.",
            ],
            [
                "Apple TV remote popup",
                "A remote overlay when you control Apple TV from Home",
                "The popup is built and waiting. Nothing on Home ever opens it.",
            ],
            [
                "Room-card look (dark overlay colour)",
                "A settings control to dim or tint room photos",
                "The popup exists. Home has no control that opens it, so it cannot be used from this page.",
            ],
            [
                "Alarm / security panel popup",
                "Tap a security badge to arm or disarm the house",
                "The popup is ready. The Home badges no longer have a security tap, so this panel never opens from Home.",
            ],
            [
                "Old “open doors” list",
                "Tap a doors count and see which doors are open",
                "That list popup is still there. Home badges only offer locks, lights, and AC — so the doors list never opens.",
            ],
        ],
        s,
        [42 * mm, 54 * mm, 78 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    story.append(banner("Work the phone still does, then throws away", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Home still calculates a few things and hands them to the badges. "
        "The badges ignore them. So this is leftover work — not something you see.",
        s["body"],
    ))
    story.append(simple_table(
        ["What is still calculated", "Why it does not show"],
        [
            [
                "Power reading, alarm state, and how many doors are open",
                "These are sent to the status row. That row only shows locks, lights, and AC now. Power, alarm, and doors are unused.",
            ],
            [
                "A full list of garage covers for an older edit screen",
                "Home Access already builds its own garage list. This extra list is never used.",
            ],
            [
                "A “current floor” value, always set to Home",
                "Room cards do not use it. Floor picking lives on the Rooms tab instead.",
            ],
            [
                "A catalogue of device categories from the house",
                "The phone still asks the house for this list on load, then never reads it on Home.",
            ],
            [
                "Whether each camera is online (green / off)",
                "Home still checks camera status every 10 seconds, but the thumbnail does not show online vs offline.",
            ],
        ],
        s,
        [72 * mm, 102 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    story.append(banner("Old pieces still sitting in Home, never called", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "These are leftover from earlier versions of Home. They do not appear, and they do not run.",
        s["body"],
    ))
    story.append(bullets([
        "<b>A second camera list</b> (Home Assistant cameras as a separate grid) is still attached to Home, but Home uses the camera strip instead. That second list is never shown here.",
        "<b>A loading spinner</b> is still written on the page. Home uses the grey blocks instead, so the spinner never appears.",
        "<b>Shutter controls</b> are still written inside Home Access. Shutters now live inside a room, so those shutter pills never show on Home.",
        "<b>Scene icons</b> are still written twice. The cards already pick their own icons. The extra copy on the scenes row is never used.",
    ], s))
    story.append(Spacer(1, 4 * mm))

    story.append(banner("What this is not", s))
    story.append(Spacer(1, 4 * mm))
    story.append(bullets([
        "This is <b>not</b> a list of everything the app can do. Lights, scenes, locks, garage, rooms, and cameras on Home <b>are</b> in use.",
        "This is <b>not</b> about Rooms, CCTV, Butler, or Settings — those screens were not checked here.",
        "This is <b>not</b> saying Home is broken. It means a few older pieces were left behind when the screen was simplified.",
    ], s))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box(
        "In one sentence: Home still carries a handful of leftover popups, counts, and lists "
        "from an older layout. They do not show, and most of them do not run — they are spare parts, not missing features for the person using the phone.",
        s,
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="Home screen leftover pieces",
        author="Primewave",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
