#!/usr/bin/env python3
"""Settings pages inventory: what exists, how to enhance, what to remove."""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parent / "AppV1_Settings_Pages_Enhancement_Guide.pdf"

NAVY = colors.HexColor("#0F172A")
TEAL = colors.HexColor("#0F766E")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")
ALT = colors.HexColor("#F8FAFC")
BORDER = colors.HexColor("#E2E8F0")
KEEP = colors.HexColor("#166534")
REMOVE = colors.HexColor("#B91C1C")
MOVE = colors.HexColor("#A16207")


def S():
    b = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle("cover", fontName="Helvetica-Bold", fontSize=24, leading=30,
                                textColor=NAVY, alignment=TA_CENTER, spaceAfter=10),
        "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=11, leading=15,
                              textColor=MUTED, alignment=TA_CENTER, spaceAfter=4),
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=18,
                             textColor=NAVY, spaceBefore=4, spaceAfter=8),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
                             textColor=TEAL, spaceBefore=10, spaceAfter=5),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13,
                               textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=5),
        "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=12.5,
                                 textColor=SLATE, spaceAfter=2),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=SLATE),
        "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=NAVY),
        "tag_keep": ParagraphStyle("tag_keep", fontName="Helvetica-Bold", fontSize=8, textColor=KEEP),
        "tag_remove": ParagraphStyle("tag_remove", fontName="Helvetica-Bold", fontSize=8, textColor=REMOVE),
        "tag_move": ParagraphStyle("tag_move", fontName="Helvetica-Bold", fontSize=8, textColor=MOVE),
        "callout": ParagraphStyle("callout", fontName="Helvetica", fontSize=9.5, leading=13, textColor=NAVY),
    }


def hf(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    y = A4[1] - 11 * mm
    canvas.line(18 * mm, y, A4[0] - 18 * mm, y)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, y + 2 * mm, "AppV1 Settings — Pages, Enhancements & Removals")
    canvas.drawRightString(A4[0] - 18 * mm, y + 2 * mm, date.today().isoformat())
    canvas.line(18 * mm, 11 * mm, A4[0] - 18 * mm, 11 * mm)
    canvas.drawCentredString(A4[0] / 2, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


def banner(title, s, color=TEAL):
    t = Table([[Paragraph(title, ParagraphStyle(
        "b", fontName="Helvetica-Bold", fontSize=11, textColor=colors.white, leading=14))]],
        colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def tbl(rows, widths, s, header=True):
    data = []
    for i, row in enumerate(rows):
        data.append([
            Paragraph(str(c), s["cellb"] if (header and i == 0) or (j == 0 and not (header and i == 0) and False)
                      else (s["cellb"] if header and i == 0 else s["cell"]))
            for j, c in enumerate(row)
        ])
    # rebuild with clearer header styling
    data = []
    for i, row in enumerate(rows):
        r = []
        for c in row:
            if header and i == 0:
                r.append(Paragraph(str(c), ParagraphStyle(
                    "hcell", fontName="Helvetica-Bold", fontSize=8.5,
                    leading=11, textColor=colors.white)))
            else:
                r.append(Paragraph(str(c), s["cell"]))
        data.append(r)
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ALT]),
    ]))
    return t


def bullets(items, s):
    return ListFlowable(
        [ListItem(Paragraph(x, s["bullet"]), leftIndent=10, bulletColor=TEAL) for x in items],
        bulletType="bullet", start="•", leftIndent=8, bulletFontSize=9,
    )


def page_block(story, s, title, what_is, items, enhance, remove_or_move):
    story.append(Paragraph(title, s["h2"]))
    story.append(Paragraph(f"<b>What is on this page:</b> {what_is}", s["body"]))
    if items:
        story.append(tbl(
            [["Item", "What it does today"]] + items,
            [50 * mm, 124 * mm], s,
        ))
        story.append(Spacer(1, 2 * mm))
    story.append(Paragraph("<b>How to enhance:</b>", s["body"]))
    story.append(bullets(enhance, s))
    story.append(Paragraph("<b>Not necessary / should change:</b>", s["body"]))
    story.append(bullets(remove_or_move, s))
    story.append(Spacer(1, 3 * mm))


def build():
    s = S()
    story = []
    W = 174 * mm

    # Cover
    story.append(Spacer(1, 35 * mm))
    story.append(Paragraph("AppV1 Settings", s["cover"]))
    story.append(Paragraph("All Pages · How to Enhance · What Is Not Necessary", s["sub"]))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(f"{date.today().isoformat()} · SettingsView (phone tab + tablet sidebar)", s["sub"]))
    story.append(Spacer(1, 12 * mm))
    box = Table([[Paragraph(
        "This guide lists <b>every page/tab inside Settings</b>, what each contains, "
        "<b>how you can enhance it</b>, and <b>what is not necessary</b> (remove, hide, or move elsewhere).",
        s["callout"])]], colWidths=[W])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 1, TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(box)
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("<b>Settings today has 5 tabs</b>", s["h1"]))
    story.append(tbl([
        ["Tab", "Role today", "Verdict"],
        ["1. General", "Real settings + tools mixed together", "Keep — but clean up"],
        ["2. Areas", "Browse HA areas / devices (read-only)", "Not a setting — move to Diagnostics"],
        ["3. Entities", "Flat list of all HA entities (read-only)", "Not a setting — move to Diagnostics"],
        ["4. A.I.", "AI model + API keys", "Keep — for admin/power users"],
        ["5. Account", "Profile, test push, logout", "Keep — expand slightly"],
    ], [32 * mm, 90 * mm, 52 * mm], s))

    # ── GENERAL ───────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(banner("TAB 1 — GENERAL (main Settings scroll)", s))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "General is one long scroll with <b>4 sections</b> inside it. Treat each section like a “page”.",
        s["body"],
    ))

    page_block(
        story, s,
        "1A. Display",
        "Toggles that change how the home / room UI behaves.",
        [
            ["Show Family", "Show person badges on the dashboard"],
            ["Auto-Room (On Visit)", "Open room sheet when location changes"],
            ["Auto-Room (Resume)", "Check location again when opening the app"],
            ["Voice Assistant", "Legacy center voice widget (mainly tablet). Phone uses Butler tab."],
            ["Show Preference Button", "Show/hide Activate Preferences in room view"],
            ["Automations", "Opens Automations screen (not a display toggle)"],
        ],
        [
            "Add <b>Card Appearance</b> here (opacity + overlay color) — modal already exists but is not linked.",
            "Group Auto-Room Visit + Resume under one “Auto room” row with a detail sheet.",
            "Rename Voice Assistant to “Tablet voice widget” so it is not confused with Butler.",
            "Add short “what this does” examples under each toggle.",
        ],
        [
            "<b>Automations</b> does not belong under Display — move to Tools / Advanced.",
            "<b>Voice Assistant</b> is not necessary for phone users (Butler tab already covers voice) — hide on phone or remove if unused.",
        ],
    )

    page_block(
        story, s,
        "1B. Notifications",
        "Controls how the house reminds / alerts you.",
        [
            ["Still-Open Reminder", "How often to remind (10–60 min) for open lock/sensor/garage/shutter"],
            ["Monitored Entities", "Opens modal to ignore entities for push"],
            ["Alert Entities", "Opens modal to create state-based alert rules"],
        ],
        [
            "Show whether OS notification permission is On/Off + button to open system settings.",
            "Add Mute / Quiet hours (e.g. no pushes 11pm–7am).",
            "Rename “Monitored Entities” → “Ignored for notifications” (clearer).",
            "Move Test Push from Account into this section.",
        ],
        [
            "Nothing here is useless — but names are technical. Keep features, improve labels.",
            "Still-Open is house-wide (backend). Label it clearly: “Affects this whole home.”",
        ],
    )

    page_block(
        story, s,
        "1C. Data &amp; System",
        "AI preference tools + FaceID + About.",
        [
            ["Preferenced Entities", "Which entities AI may learn from"],
            ["AI Learned Preferences", "View learned patterns"],
            ["Run AI Analysis Now", "Live learning monitor"],
            ["FaceID / Biometrics", "Enable biometric login"],
            ["My Preferences", "On-demand AI room analysis"],
            ["About", "Version &amp; developer info"],
        ],
        [
            "Merge AI preference items into the <b>A.I. tab</b> (one place for all AI).",
            "Keep FaceID + About under Account (natural place).",
            "Fix My Preferences so it does not hardcode one person’s tracker entity.",
        ],
        [
            "<b>Run AI Analysis Now</b> is an admin/debug tool — not needed for normal homeowners; move to Advanced / Developer.",
            "Duplicate FaceID also exists on login Settings — keep one primary place (Account).",
        ],
    )

    page_block(
        story, s,
        "1D. Quick Actions",
        "Shortcuts to other screens / labs.",
        [
            ["Network", "Wi‑Fi / AP modal"],
            ["History", "History screen"],
            ["My Statistics", "Statistics screen"],
            ["Insights", "Insights screen"],
            ["Entity History", "Pick entity → history"],
            ["Go to V3", "Tablet widget dashboard experiment"],
            ["Test TV", "TV lab / remote test"],
        ],
        [
            "If you keep any of these, put them under <b>Advanced → Tools</b>, not General.",
            "History / Statistics / Insights could live in a Home “Activity” tab instead of Settings.",
        ],
        [
            "<b>Go to V3</b> — not necessary in Settings for end users; Developer only.",
            "<b>Test TV</b> — not necessary in Settings; Developer / lab only.",
            "<b>Entity History / Insights / My Statistics / History</b> — not “settings”; move out of Settings.",
            "<b>Network</b> — installer/admin tool; keep but under Connection / Advanced, not Quick Actions.",
        ],
    )

    # ── AREAS / ENTITIES ──────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(banner("TAB 2 — AREAS", s))
    story.append(Spacer(1, 3 * mm))
    page_block(
        story, s,
        "2. Areas",
        "Read-only browser of Home Assistant areas → devices/entities with live state.",
        [
            ["Area list", "Shows selected / available areas"],
            ["Area detail", "Devices and entities in that area + live state"],
        ],
        [
            "Add search / filter by domain (light, climate, cover).",
            "Tap entity → copy entity_id (helpful for support).",
            "If kept, rename tab to <b>Diagnostics</b> and put Areas + Entities inside it.",
        ],
        [
            "<b>Not necessary as a main Settings tab.</b> Users do not “configure” anything here.",
            "Remove from primary tabs for homeowners; keep only for admin/support under Advanced.",
        ],
    )

    story.append(banner("TAB 3 — ENTITIES", s))
    story.append(Spacer(1, 3 * mm))
    page_block(
        story, s,
        "3. Entities",
        "Flat read-only list of live Home Assistant entities.",
        [
            ["Entity list", "All entities with state (browse / debug)"],
        ],
        [
            "Add search box and domain chips (light / climate / sensor).",
            "Combine with Areas under one Diagnostics page (two sub-tabs).",
        ],
        [
            "<b>Not necessary as a main Settings tab</b> for normal use — same as Areas.",
            "HA already has a better entity registry; this is only useful for in-app debugging.",
        ],
    )

    # ── AI ────────────────────────────────────────────────────────────────
    story.append(banner("TAB 4 — A.I.", s))
    story.append(Spacer(1, 3 * mm))
    page_block(
        story, s,
        "4. A.I.",
        "Choose AI provider, store API keys, test connection, save.",
        [
            ["Active Model", "openai / anthropic / gemini"],
            ["API Keys", "Per-provider keys + Test buttons"],
            ["Save Configuration", "Persist keys + active model on device"],
        ],
        [
            "Move Preferenced Entities / Learned Preferences / My Preferences here from General.",
            "Mask keys by default; show last-4 characters only.",
            "Store keys <b>per home profile</b> (Office vs Majeed should not share keys).",
            "Show which features use AI (Butler, preferences, analysis).",
        ],
        [
            "For pure homeowners who never touch API keys: hide this tab behind Admin / Developer.",
            "Do not leave unused provider key fields confusing if only one model is used — collapse inactive ones.",
        ],
    )

    # ── ACCOUNT ───────────────────────────────────────────────────────────
    story.append(banner("TAB 5 — ACCOUNT", s))
    story.append(Spacer(1, 3 * mm))
    page_block(
        story, s,
        "5. Account",
        "User identity, test push, logout.",
        [
            ["Profile header", "Shows name; role always says “Administrator”"],
            ["Test Push Notification", "Sends a test push via admin backend"],
            ["Log Out", "Clears session and returns to login"],
        ],
        [
            "Add <b>Connection / Home profile</b> here: HA URL, Admin URL, switch profile (today only on login screen).",
            "Move FaceID here from Data &amp; System.",
            "Show real role from backend (or remove fake “Administrator”).",
            "On logout, clearly say what stays (profiles, AI keys) vs what clears (session).",
            "Move Test Push under Notifications.",
        ],
        [
            "Hardcoded <b>Administrator</b> label is not necessary / misleading — remove or make real.",
            "Empty section stub in code (“Transferred to General”) — clean up dead UI.",
        ],
    )

    # ── SUMMARY REMOVE / KEEP ─────────────────────────────────────────────
    story.append(PageBreak())
    story.append(banner("SUMMARY — Keep · Move · Remove", s, NAVY))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("<b>Keep in Settings (core)</b>", s["h2"]))
    story.append(tbl([
        ["Keep", "Where"],
        ["Show Family, Auto-Room, Preference Button", "Display"],
        ["Still-Open Reminder, Monitored, Alert Entities", "Notifications"],
        ["FaceID, Logout, user name", "Account"],
        ["About", "Account (or footer)"],
        ["AI keys / model (for admins)", "A.I. tab"],
        ["Card Appearance (add it)", "Display"],
        ["Connection / Profiles (add it)", "Account or new Connection tab"],
    ], [95 * mm, 79 * mm], s))

    story.append(Paragraph("<b>Move out of main Settings (still useful elsewhere)</b>", s["h2"]))
    story.append(tbl([
        ["Item", "Move to"],
        ["Areas + Entities tabs", "Advanced → Diagnostics"],
        ["History, My Statistics, Insights, Entity History", "Home Activity / Insights area (not Settings)"],
        ["Automations", "Own tab or Advanced → Tools"],
        ["Network", "Connection / Advanced (installer)"],
        ["Run AI Analysis Now", "A.I. → Advanced / Developer"],
        ["Preferenced / Learned / My Preferences", "A.I. tab (one AI home)"],
        ["Test Push", "Notifications section"],
    ], [85 * mm, 89 * mm], s))

    story.append(Paragraph("<b>Not necessary for normal users (hide or delete from Settings)</b>", s["h2"]))
    story.append(tbl([
        ["Item", "Why not necessary in Settings"],
        ["Go to V3", "Experimental dashboard — developer only"],
        ["Test TV", "Lab tool — developer only"],
        ["Voice Assistant (phone)", "Butler tab already provides voice on phone"],
        ["Areas / Entities as main tabs", "Read-only debug, not configuration"],
        ["Hardcoded “Administrator”", "Fake role; adds no value"],
        ["Duplicate FaceID on login + Settings", "Keep one clear place"],
    ], [70 * mm, 104 * mm], s))

    story.append(Spacer(1, 6 * mm))
    story.append(banner("Recommended final Settings structure", s))
    story.append(Spacer(1, 3 * mm))
    story.append(tbl([
        ["Tab / Section", "Contains"],
        ["Display", "Family, Auto-Room, Preference button, Card Appearance, (optional tablet voice)"],
        ["Notifications", "Permission status, Still-Open, Ignored entities, Alerts, Test push, Quiet hours"],
        ["Connection", "Active home profile, HA URL, Admin URL, token (masked), Network, Butler status"],
        ["A.I.", "Model/keys + preference tools (admin)"],
        ["Account", "Name, FaceID, About, Logout"],
        ["Advanced (optional)", "Diagnostics (Areas/Entities), Automations, Developer (V3, TV Lab)"],
    ], [45 * mm, 129 * mm], s))

    story.append(Spacer(1, 8 * mm))
    end = Table([[Paragraph(
        "<b>Bottom line.</b> Settings today mixes real preferences, admin tools, and developer labs. "
        "Keep Display + Notifications + Account. Move Areas/Entities and history tools out of the main path. "
        "Remove or hide V3 / Test TV / phone Voice Assistant. Add Card Appearance and Connection — those are the biggest missing pieces.",
        s["callout"])]], colWidths=[W])
    end.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 1, TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(end)

    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title="AppV1 Settings Pages — Enhancement Guide",
        author="AppV1",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")
    return OUT


if __name__ == "__main__":
    build()
