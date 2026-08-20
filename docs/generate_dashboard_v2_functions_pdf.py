#!/usr/bin/env python3
"""Shareable note: what Dashboard V2 actually does, in everyday language.

Only jobs that run and have an effect. Leftovers are in Home_Screen_Unused_Pieces.pdf.
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

OUT = Path(__file__).resolve().parent / "Dashboard_V2_What_It_Does.pdf"

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
    canvas.drawString(18 * mm, A4[1] - 8 * mm, "Primewave  ·  Dashboard V2 — what it does")
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 8 * mm, date.today().strftime("%d %b %Y"))
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(
        A4[0] / 2, 5 * mm,
        f"Page {doc.page}  ·  First screen after login  ·  For sharing",
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
    story.append(Paragraph("What Dashboard V2 does", s["cover"]))
    story.append(Paragraph(
        "The first screen after login — in everyday language.<br/>"
        "Grouped by what you see, not by code names.",
        s["sub"],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box(
        "This is the <b>working</b> jobs on this page: connecting to the house, "
        "drawing Home, reacting to taps, and keeping things live. "
        "Leftover pieces that never show are in a separate note "
        "(Home screen leftover pieces).",
        s,
    ))
    story.append(Spacer(1, 8 * mm))

    # 1 Start
    story.append(banner("1. When the page opens", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Before Home can appear, this page finds the saved house, connects, and waits for the main pieces.",
        s["body"],
    ))
    story.append(simple_table(
        ["Job", "What it does for you"],
        [
            [
                "Load the saved house",
                "Reads which house you last signed into (address and keys) so you do not log in again.",
            ],
            [
                "Connect to Home Assistant",
                "Opens a live link to the house. Asks for the current state of every device, plus the list of rooms, floors, and device names.",
            ],
            [
                "Ask the house server for Home extras",
                "Gets the four scene buttons, which locks and garage doors belong on Home, light/TV/sensor/cover lists, and lock “passage” settings.",
            ],
            [
                "Ask for cameras",
                "Gets the camera list from Frigate, and a backup list from the house server if Frigate is not reachable.",
            ],
            [
                "Hold the grey blocks until Home is ready",
                "Home stays hidden until the house snapshot, scenes, and locks/garage have all arrived. Then the real screen appears together.",
            ],
            [
                "Keep a “still here” pulse",
                "Tells the house server this phone is open, so the session stays known.",
            ],
        ],
        s,
        [58 * mm, 116 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    # 2 Home content
    story.append(banner("2. What Home puts on the screen", s))
    story.append(Spacer(1, 4 * mm))
    story.append(simple_table(
        ["Part of the screen", "What the page is doing"],
        [
            [
                "Greeting + weather row",
                "Picks Good morning / afternoon / evening from the clock. Shows outdoor weather, humidity, and indoor temperature from the house.",
            ],
            [
                "Locks · lights · AC row",
                "Counts lights that are on and ACs that are running in the selected rooms. Shows lock dots (locked / unlocked, including door sensors).",
            ],
            [
                "People row (if turned on in Settings)",
                "Shows who is home, and any active alerts from the alert list.",
            ],
            [
                "House health banner",
                "If Home Assistant or the house server is down, a banner appears so you know controls may not work.",
            ],
            [
                "Scene buttons",
                "Takes the four chosen scenes and matches them to live house devices so the labels are correct.",
            ],
            [
                "Locks and garage (Home Access)",
                "Builds the lock pills and garage pills you can drag. Uses the chosen list, or all locks in selected rooms if none were chosen.",
            ],
            [
                "Room cards",
                "For each selected room: friendly name, photo, lights on, AC on, open covers, open doors, temperature / humidity, presence. Parent rooms can include sub-rooms (toilet, etc.) in the counts.",
            ],
            [
                "Camera strip",
                "Shows the cameras you picked. Tapping one opens live view. “All cameras” switches to the CCTV tab.",
            ],
        ],
        s,
        [52 * mm, 122 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    # 3 Taps
    story.append(banner("3. When you tap something", s))
    story.append(Spacer(1, 4 * mm))
    story.append(simple_table(
        ["What you tap", "What happens"],
        [
            [
                "A scene button",
                "Sends “turn on” to that scene in the house, and the phone vibrates.",
            ],
            [
                "A lock or garage pill",
                "Sends lock/unlock or open/close to that device. The pill moves straight away.",
            ],
            [
                "The locks row",
                "Opens the locks popup. You can also arm lock alerts from there; that choice is saved to the house server.",
            ],
            [
                "Lights or AC count",
                "Opens a list of those devices in the selected rooms so you can switch them.",
            ],
            [
                "A room card on Home",
                "Opens a slide-up sheet for that room (lights, covers, climate, media) without leaving Home.",
            ],
            [
                "A room card on the Rooms tab",
                "Opens the full room page, with the house data already prepared so that page can draw faster.",
            ],
            [
                "A camera thumbnail",
                "Opens the live camera (or history, if that mode was requested).",
            ],
            [
                "The bell",
                "Opens the notification list and marks them read.",
            ],
            [
                "The Butler / mic on the tab bar",
                "Starts a voice call with Butler, if the phone supports it. You can hang up or jump into chat.",
            ],
            [
                "Bottom tabs",
                "Switches Home, Rooms, CCTV, Butler, or Settings. On a tablet in landscape, the same job uses the side bar. “Tablet” opens the tablet layout.",
            ],
        ],
        s,
        [52 * mm, 122 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    # 4 Live
    story.append(banner("4. While you keep using the app", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "These jobs run in the background. You do not tap them — they keep the screen honest.",
        s["body"],
    ))
    story.append(simple_table(
        ["Job", "What it does for you"],
        [
            [
                "Live house updates",
                "When a light, lock, or sensor changes in the house, this page updates that device on screen without a refresh.",
            ],
            [
                "Instant feedback when you toggle",
                "Lights, switches, climate, and play/pause change on screen immediately. If the house rejects the command, the page reloads the true state.",
            ],
            [
                "In-app alerts",
                "If a watched device changes (and you have not muted it), a line is added to the bell list. Locks and garage alerts are sent by the house server instead, so every phone stays in sync.",
            ],
            [
                "Security popup when armed",
                "If the alarm is armed and a lock or garage/shutter is open, a warning popup is shown. It can be dismissed until the arm state changes again.",
            ],
            [
                "Open the room you walk into",
                "If room tracking is on, when your presence tracker says you entered a room, that room sheet opens. The same check runs when you come back to the app.",
            ],
            [
                "Coming back from background",
                "When you unlock the phone and return, the page refreshes scenes/locks lists and checks presence again. It also tells the server you are in the foreground.",
            ],
            [
                "Push notification tap",
                "If you opened the app by tapping a notification, the alert popup is shown on Home.",
            ],
        ],
        s,
        [52 * mm, 122 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    # 5 Other tabs
    story.append(banner("5. Other tabs on this same page", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Dashboard V2 is one page with tabs. Home is the first view. These are the other views the same page can show.",
        s["body"],
    ))
    story.append(simple_table(
        ["Tab", "What this page does there"],
        [
            [
                "Rooms",
                "Shows all rooms, optionally by floor. Edit lets you drag to reorder; the new order is saved on the phone.",
            ],
            [
                "CCTV",
                "Camera grid or event history. Camera views are only built while this tab is open (they are heavy). Sensor overlays on cameras use a live device map.",
            ],
            [
                "Butler",
                "Opens the chat. First visit builds it; leaving and coming back keeps the conversation. Exit clears it and returns to Home.",
            ],
            [
                "Settings",
                "Family row, auto-room, voice, preferences. Network popup. After you change which devices are monitored, the page refreshes that list so alerts stay correct.",
            ],
        ],
        s,
        [36 * mm, 138 * mm],
    ))
    story.append(Spacer(1, 8 * mm))

    story.append(banner("In one picture", s))
    story.append(Spacer(1, 4 * mm))
    story.append(bullets([
        "<b>Connect</b> — saved house, live Home Assistant link, scenes, locks/garage, cameras.",
        "<b>Draw Home</b> — greeting, weather, lock/light/AC counts, scenes, lock &amp; garage pills, room cards, camera strip.",
        "<b>Act</b> — every tap (scene, lock, garage, room, camera, bell, Butler, tabs) sends a command or opens a sheet.",
        "<b>Stay live</b> — house changes update the screen; presence can open a room; returning to the app refreshes.",
    ], s))
    story.append(note_box(
        "This page is the shell after login. Home is what you wait for first. "
        "The same page also holds Rooms, CCTV, Butler, and Settings — they are not separate apps.",
        s,
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="What Dashboard V2 does",
        author="Primewave",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
