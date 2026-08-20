#!/usr/bin/env python3
"""Generate AppV1 Settings Section — Audit & Enhancement PDF."""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    ListFlowable,
    ListItem,
)

OUT = Path(__file__).resolve().parent / "AppV1_Settings_Audit_and_Enhancement_Plan.pdf"

# Brand-ish palette (avoid purple AI cliché; use deep navy + teal)
NAVY = colors.HexColor("#0F172A")
TEAL = colors.HexColor("#0D9488")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LIGHT_BG = colors.HexColor("#F1F5F9")
ROW_ALT = colors.HexColor("#F8FAFC")
BORDER = colors.HexColor("#E2E8F0")
P0 = colors.HexColor("#B91C1C")
P1 = colors.HexColor("#C2410C")
P2 = colors.HexColor("#0369A1")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Title"],
            fontName="Helvetica-Bold", fontSize=26, leading=32,
            textColor=NAVY, alignment=TA_CENTER, spaceAfter=12,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=base["Normal"],
            fontName="Helvetica", fontSize=12, leading=16,
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"],
            fontName="Helvetica-Bold", fontSize=16, leading=20,
            textColor=NAVY, spaceBefore=18, spaceAfter=10,
            borderPadding=3,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"],
            fontName="Helvetica-Bold", fontSize=13, leading=17,
            textColor=TEAL, spaceBefore=14, spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"],
            fontName="Helvetica-Bold", fontSize=11, leading=14,
            textColor=SLATE, spaceBefore=10, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"],
            fontName="Helvetica", fontSize=9.5, leading=13,
            textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["Normal"],
            fontName="Helvetica", fontSize=9.5, leading=13,
            textColor=SLATE, leftIndent=8, spaceAfter=3,
        ),
        "cell": ParagraphStyle(
            "cell", parent=base["Normal"],
            fontName="Helvetica", fontSize=8.5, leading=11,
            textColor=SLATE,
        ),
        "cell_b": ParagraphStyle(
            "cell_b", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=8.5, leading=11,
            textColor=NAVY,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"],
            fontName="Helvetica", fontSize=8, textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "caption": ParagraphStyle(
            "caption", parent=base["Normal"],
            fontName="Helvetica-Oblique", fontSize=8.5, leading=11,
            textColor=MUTED, spaceAfter=8, spaceBefore=2,
        ),
        "callout": ParagraphStyle(
            "callout", parent=base["Normal"],
            fontName="Helvetica", fontSize=9.5, leading=13,
            textColor=NAVY, leftIndent=6, rightIndent=6,
        ),
    }
    return s


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, A4[1] - 12 * mm, A4[0] - 18 * mm, A4[1] - 12 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, A4[1] - 10 * mm, "AppV1 Settings — Audit & Enhancement Plan")
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 10 * mm, "Confidential")
    canvas.line(18 * mm, 12 * mm, A4[0] - 18 * mm, 12 * mm)
    canvas.drawCentredString(A4[0] / 2, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def table(data, col_widths, s, header=True):
    styled = []
    for i, row in enumerate(data):
        styled_row = []
        for j, cell in enumerate(row):
            style = s["cell_b"] if (header and i == 0) or j == 0 else s["cell"]
            if isinstance(cell, Paragraph):
                styled_row.append(cell)
            else:
                styled_row.append(Paragraph(str(cell), style if not (header and i == 0) else s["cell_b"]))
        styled.append(styled_row)

    t = Table(styled, colWidths=col_widths, repeatRows=1 if header else 0)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY if header else LIGHT_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white if header else NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
    ]
    t.setStyle(TableStyle(cmds))
    return t


def bullets(items, s):
    return ListFlowable(
        [ListItem(Paragraph(i, s["bullet"]), leftIndent=12, bulletColor=TEAL) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=10,
        bulletFontSize=9,
    )


def section_banner(title, s):
    data = [[Paragraph(title, ParagraphStyle(
        "banner", fontName="Helvetica-Bold", fontSize=11,
        textColor=colors.white, leading=14,
    ))]]
    t = Table(data, colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    return t


def build():
    s = styles()
    story = []
    W = 170 * mm

    # ── Cover ─────────────────────────────────────────────────────────────
    story.append(Spacer(1, 45 * mm))
    story.append(Paragraph("AppV1 Settings Section", s["cover_title"]))
    story.append(Paragraph("Complete Audit, Inventory &amp; Enhancement Plan", s["cover_sub"]))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(f"Document date: {date.today().isoformat()}", s["cover_sub"]))
    story.append(Paragraph("Product: AppV1 (Expo / React Native) · Dashboard V2", s["cover_sub"]))
    story.append(Paragraph("Primary component: <b>SettingsView.jsx</b>", s["cover_sub"]))
    story.append(Spacer(1, 16 * mm))

    cover_box = Table([[Paragraph(
        "<b>Purpose.</b> This document inventories every setting currently available in AppV1 "
        "(phone + tablet), how each is stored, known gaps and bugs, and a prioritized roadmap "
        "to make Settings clearer, more complete, and easier to maintain.",
        s["callout"],
    )]], colWidths=[W])
    cover_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 1, TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(cover_box)
    story.append(PageBreak())

    # ── 1. Executive summary ──────────────────────────────────────────────
    story.append(section_banner("1. Executive Summary", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Settings in AppV1 is a shared screen used by both phone (bottom tab) and tablet "
        "(sidebar). It mixes real user preferences, admin-backed notification tools, AI "
        "configuration, read-only Home Assistant diagnostics, and developer shortcuts. "
        "That mix makes the section powerful for operators but confusing as a consumer "
        "“Settings” experience.",
        s["body"],
    ))
    story.append(Paragraph("<b>Key findings</b>", s["h3"]))
    story.append(bullets([
        "<b>Five tabs:</b> General · Areas · Entities · A.I. · Account.",
        "<b>Connection profiles</b> (HA URL, token, Admin URL) live only on the login screen — not inside Settings after login.",
        "<b>Card Appearance</b> (opacity / overlay color) exists as a modal but is currently <b>unreachable</b> from the UI and is <b>not persisted</b>.",
        "<b>Home totals for lights/ACs</b> and room badges were recently aligned to per-room rules; Settings itself does not control those rules.",
        "Largest UX win: restructure IA, restore Card Appearance, add in-app Connection/Profiles, and gate developer tools.",
    ], s))

    story.append(Paragraph("<b>Recommended north star</b>", s["h3"]))
    story.append(Paragraph(
        "Treat Settings as: <b>Display · Notifications · Connection · AI &amp; Preferences · "
        "Account · Advanced/Diagnostics</b>. Move History / V3 / TV Lab behind a Developer flag. "
        "Keep Areas/Entities as Diagnostics, not primary tabs.",
        s["body"],
    ))

    # ── 2. Architecture ───────────────────────────────────────────────────
    story.append(section_banner("2. Architecture &amp; Entry Points", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("<b>2.1 Primary files</b>", s["h2"]))
    story.append(table([
        ["Surface", "Path", "Notes"],
        ["Main Settings UI", "components/DashboardV2/SettingsView.jsx", "Shared phone + tablet"],
        ["Phone host", "app/dashboard-v2.jsx", "TabBar → settings"],
        ["Tablet host", "app/dashboard-v2-tablet.jsx", "TabletSidebar → settings"],
        ["Card Appearance", "components/DashboardV2/OpacitySettingsModal.jsx", "Currently unreachable"],
        ["Login profiles", "app/login.jsx", "HA / Admin / FaceID"],
        ["Legacy modal", "components/Dashboard/SettingsModal.jsx", "V1 dashboard only"],
    ], [38 * mm, 78 * mm, 54 * mm], s))

    story.append(Paragraph("<b>2.2 Modals opened from Settings</b>", s["h2"]))
    story.append(table([
        ["Modal", "Purpose"],
        ["MonitoredEntitiesModal", "Ignore entities for push notifications"],
        ["AlertEntitiesModal / AddAlertModal", "CRUD still-open / state alert rules"],
        ["PreferencedEntitiesModal", "Include/exclude entities from AI preference learning"],
        ["MyPreferencesModal", "Run on-demand AI habit analysis"],
        ["NetworkModal", "Wi‑Fi / AP configuration (admin-backed)"],
        ["OpacitySettingsModal", "Room card opacity + overlay color"],
    ], [55 * mm, 115 * mm], s))

    story.append(Paragraph("<b>2.3 How users open Settings</b>", s["h2"]))
    story.append(bullets([
        "<b>Phone:</b> bottom tab “Settings”.",
        "<b>Tablet:</b> left sidebar “Settings”.",
        "<b>Login:</b> gear → connection profile manager (pre-dashboard).",
        "<b>Legacy V1:</b> header gear → Areas/Entities only.",
        "<b>Broken:</b> Rooms gear / onSettingsPress for Card Appearance is no longer wired.",
    ], s))

    # ── 3. Full inventory ─────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section_banner("3. Complete Settings Inventory", s))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("<b>3.1 General → Display</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Show Family", "Person badges on home dashboard", "SecureStore: settings_show_family"],
        ["Auto-Room (On Visit)", "Open room sheet when presence/location changes", "settings_auto_room_visit"],
        ["Auto-Room (Resume)", "Re-check location when app resumes", "settings_auto_room_resume"],
        ["Voice Assistant", "Legacy center voice widget (tablet). Phone uses Butler tab.", "settings_show_voice_assistant"],
        ["Show Preference Button", "Global show/hide of Activate Preferences in rooms", "settings_show_preference_button"],
        ["Automations", "Navigates to /automations (not a toggle)", "—"],
    ], [42 * mm, 78 * mm, 50 * mm], s))

    story.append(Paragraph("<b>3.2 General → Notifications</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Still-Open Reminder", "Interval (10–60 min) to re-alert open locks/sensors/garage/shutters", "Admin POST /api/config (still_open_reminder_ms)"],
        ["Monitored Entities", "Mark entities ignored for push", "Admin /api/monitor"],
        ["Alert Entities", "Rules: entity + trigger state + threshold + optional repeat", "Admin /api/alerts"],
        ["Test Push (Account tab)", "Sends a test notification via backend", "POST /api/notifications/send"],
    ], [42 * mm, 78 * mm, 50 * mm], s))

    story.append(Paragraph("<b>3.3 General → Data &amp; System / Preferences</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Preferenced Entities", "Include/exclude from AI preference analysis", "Admin /api/monitor (includePreference)"],
        ["AI Learned Preferences", "Browse learned patterns by room/hour", "Route → ai-preferences.jsx"],
        ["Run AI Analysis Now", "Live analysis monitor", "Route → analysis-monitor.jsx"],
        ["My Preferences", "On-demand AI habit analysis", "POST /api/preferences/analyze"],
        ["FaceID / Biometrics", "Enable biometric login", "SecureStore: face_id_enabled"],
        ["About", "Version / developer info", "Route → about.jsx"],
    ], [42 * mm, 78 * mm, 50 * mm], s))

    story.append(Paragraph("<b>3.4 General → Quick Actions (tools)</b>", s["h2"]))
    story.append(Paragraph(
        "Network · History · My Statistics · Insights · Entity History · Go to V3 · Test TV. "
        "These are product tools / labs, not user preferences. Recommend moving under "
        "<b>Advanced → Tools</b> or a Developer flag.",
        s["body"],
    ))

    story.append(Paragraph("<b>3.5 Areas &amp; Entities tabs</b>", s["h2"]))
    story.append(Paragraph(
        "Read-only Home Assistant diagnostics: browse areas → devices/entities with live state, "
        "or a flat entity list. Useful for support, but they are not “settings.” Recommend "
        "renaming to <b>Diagnostics</b> and demoting from primary tabs.",
        s["body"],
    ))

    story.append(Paragraph("<b>3.6 A.I. tab</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Active Model", "openai / anthropic / gemini", "SecureStore: active_ai_model"],
        ["API Keys + Test", "Store and test provider keys", "api_key_openai / _anthropic / _gemini"],
        ["Save Configuration", "Persist keys + active model", "SecureStore"],
    ], [42 * mm, 78 * mm, 50 * mm], s))
    story.append(Paragraph(
        "<i>Note:</i> AI keys are device-global, not per connection profile. Switching homes "
        "on one device shares the same keys.",
        s["caption"],
    ))

    story.append(Paragraph("<b>3.7 Account tab</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Profile display", "Shows logged-in name; role hardcoded “Administrator”", "Session SecureStore"],
        ["Test Push Notification", "Backend test push", "Admin API"],
        ["Log Out", "Unregister push + clear session → /login", "Clears session keys (not profiles/AI keys)"],
    ], [42 * mm, 78 * mm, 50 * mm], s))

    story.append(Paragraph("<b>3.8 Login “Settings” (connection profiles)</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Profiles list", "Add / edit / delete / select active home", "ha_profiles + ha_active_profile_id"],
        ["Profile Name", "Label for the home", "Inside profile JSON"],
        ["Home Assistant URL", "+ optional network scan", "profile.haUrl"],
        ["Admin Backend URL", "AppBackend base URL", "profile.adminUrl"],
        ["Long-Lived Access Token", "HA token", "profile.haToken"],
        ["Enable FaceID Login", "Global biometric toggle", "face_id_enabled"],
    ], [42 * mm, 78 * mm, 50 * mm], s))

    story.append(Paragraph("<b>3.9 Card Appearance (OpacitySettingsModal)</b>", s["h2"]))
    story.append(table([
        ["Setting", "What it does", "Storage"],
        ["Opacity slider", "Room card overlay transparency", "In-memory only (lost on relaunch)"],
        ["Overlay color", "Presets + hex", "In-memory only"],
        ["Apply", "Updates dashboard card overlays", "Not written to SecureStore"],
    ], [42 * mm, 78 * mm, 50 * mm], s))

    story.append(Paragraph("<b>3.10 Related config outside Settings screen</b>", s["h2"]))
    story.append(bullets([
        "<b>Per-room preference visibility:</b> room_scenes_show_prefs_{areaId} via QuickScenes editor.",
        "<b>Room reorder:</b> drag order → room_reorder_config.",
        "<b>Floors:</b> runtime filter from HA floor registry (not a Settings toggle).",
        "<b>Butler:</b> derived from adminUrl + /api/butler — no Settings control.",
        "<b>Light/AC counting rules:</b> coded in lightCapabilities.js (Master Controller skip; other groups count as 1).",
    ], s))

    # ── 4. Data flow ──────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section_banner("4. Persistence Model", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Settings split across three layers. Understanding this is essential before enhancing "
        "sync, multi-profile, or multi-user behavior.",
        s["body"],
    ))
    story.append(table([
        ["Layer", "Examples", "Implication"],
        ["SecureStore (device)", "Toggles, AI keys, profiles, FaceID, room order", "Per device; not shared across phones"],
        ["Admin backend (home)", "Still-open reminder, monitor ignore, alert rules, prefs", "Affects whole home / all app users of that backend"],
        ["In-memory / session", "Card opacity/color, selected floor", "Lost on restart unless we add persistence"],
    ], [40 * mm, 70 * mm, 60 * mm], s))
    story.append(Paragraph(
        "<b>Risk:</b> Still-Open Reminder is global server config. Changing it on one phone "
        "changes behavior for every client of that house backend.",
        s["body"],
    ))

    # ── 5. Gaps & bugs ────────────────────────────────────────────────────
    story.append(section_banner("5. Gaps, Bugs &amp; Inconsistencies", s))
    story.append(Spacer(1, 4 * mm))
    story.append(table([
        ["#", "Issue", "Impact"],
        ["1", "Card Appearance modal unreachable (onSettingsPress unused)", "Feature exists but users cannot open it"],
        ["2", "Opacity/color not persisted", "Even if opened, resets every launch"],
        ["3", "No in-app Connection / Profile editor after login", "Must log out / use login gear to change HA/Admin"],
        ["4", "Dual FaceID UIs (login + Settings)", "Confusing duplicate controls, same key"],
        ["5", "Account role hardcoded “Administrator”", "Misleading for real multi-role homes"],
        ["6", "MyPreferencesModal hardcodes tracking entity", "Broken / wrong for Office & other clients"],
        ["7", "VoiceAssistantButton may still read legacy admin_url", "Broken after profile migration"],
        ["8", "IA: Automations under Display; Quick Actions mixed in", "Settings feels like a dumping ground"],
        ["9", "AI keys not per-profile", "Wrong keys when switching homes on one device"],
        ["10", "Areas/Entities presented as peer tabs to real settings", "Noise for normal users"],
        ["11", "Global + per-room preference button overrides", "Easy for settings to “fight” each other"],
        ["12", "Legacy V1 SettingsModal still in repo", "Drift / maintenance cost"],
        ["13", "Logout does not clarify what is cleared", "Users unsure if profiles/keys remain"],
        ["14", "Still-open reminder is house-global", "One user’s change affects everyone"],
    ], [12 * mm, 88 * mm, 70 * mm], s))

    # ── 6. Enhancement plan ───────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section_banner("6. Enhancement Plan (Prioritized)", s))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("<b>6.1 Information architecture (target)</b>", s["h2"]))
    story.append(table([
        ["Section", "Contents"],
        ["Display", "Show Family, Auto-Room toggles, Preference button, Card Appearance, Theme"],
        ["Notifications", "OS permission status, Still-Open interval, Monitored, Alerts, Quiet hours, Test push"],
        ["Connection", "Active profile, HA URL, Admin URL, token (masked), Switch profile, Butler health"],
        ["AI & Preferences", "Model/keys (per profile), Preferenced entities, Learned prefs, Analyze"],
        ["Account", "User name, real role, FaceID, Logout (with clear “what is wiped” copy)"],
        ["Advanced", "Diagnostics (Areas/Entities), Automations, History tools, Developer (V3/TV Lab)"],
    ], [40 * mm, 130 * mm], s))

    story.append(Paragraph("<b>6.2 P0 — Ship first</b>", s["h2"]))
    story.append(table([
        ["ID", "Enhancement", "Why"],
        ["P0-1", "Add Card Appearance under Display + persist opacity/color in SecureStore", "Feature is built but dead; high user value"],
        ["P0-2", "In-app Connection / Profiles (view, edit, switch without opaque logout flow)", "Core ops task for multi-home installers"],
        ["P0-3", "Fix legacy admin_url / hardcoded tracking entity paths", "Correctness across Office / Majeed / fleet"],
        ["P0-4", "Unify Master Controller detection + light counts (already in progress)", "Room badge = room UI = home total"],
    ], [18 * mm, 92 * mm, 60 * mm], s))

    story.append(Paragraph("<b>6.3 P1 — Next sprint</b>", s["h2"]))
    story.append(table([
        ["ID", "Enhancement", "Why"],
        ["P1-1", "Restructure tabs to Display / Notifications / Connection / AI / Account / Advanced", "Clarity"],
        ["P1-2", "Notification center: permission status, mute, quiet hours", "Real-world usability"],
        ["P1-3", "Per-profile AI keys (or clear keys on profile switch)", "Multi-home safety"],
        ["P1-4", "Butler health + backend reachability under Connection", "Supportability"],
        ["P1-5", "Persist last floor + optional default floor", "Tablet/home continuity"],
        ["P1-6", "Clarify global vs per-room Preference Button overrides in UI", "Stops conflicting toggles"],
    ], [18 * mm, 92 * mm, 60 * mm], s))

    story.append(Paragraph("<b>6.4 P2 — Polish</b>", s["h2"]))
    story.append(table([
        ["ID", "Enhancement", "Why"],
        ["P2-1", "Theme / density beyond card overlay", "Visual product depth"],
        ["P2-2", "Gate V3 / TV Lab behind Developer mode", "Keep Settings clean"],
        ["P2-3", "Real roles from backend; editable display name", "Multi-user readiness"],
        ["P2-4", "Retire legacy dashboard SettingsModal", "Reduce drift"],
        ["P2-5", "Export/import or QR share of connection profile (secure)", "Faster house onboarding"],
        ["P2-6", "Per-user still-open preferences (if backend supports)", "Avoid house-wide side effects"],
    ], [18 * mm, 92 * mm, 60 * mm], s))

    # ── 7. UX principles ──────────────────────────────────────────────────
    story.append(Paragraph("<b>6.5 UX principles for the redesign</b>", s["h2"]))
    story.append(bullets([
        "<b>One job per section</b> — preferences vs diagnostics vs developer tools.",
        "<b>Immediate feedback</b> — toggles save instantly; show toast on admin saves.",
        "<b>Mask secrets</b> — tokens/keys hidden by default with reveal + copy.",
        "<b>Explain scope</b> — label each setting as Device / This home / All users.",
        "<b>Search</b> — as the list grows, add a Settings search field.",
        "<b>Parity</b> — phone and tablet remain one SettingsView; only nav chrome differs.",
    ], s))

    # ── 7. Proposed wire ──────────────────────────────────────────────────
    story.append(section_banner("7. Suggested Implementation Order", s))
    story.append(Spacer(1, 4 * mm))
    story.append(table([
        ["Week", "Deliverable"],
        ["1", "P0-1 Card Appearance entry + SecureStore persistence; wire from Settings → Display"],
        ["1–2", "P0-2 Connection section (read active profile, edit URLs/token, switch profile)"],
        ["2", "P0-3 Fix hardcoded entity + legacy admin URL reads; verify Office + Majeed"],
        ["3", "P1-1 IA restructure (tabs/sections) without breaking existing toggles"],
        ["3–4", "P1-2 Notifications polish; P1-3 per-profile AI keys"],
        ["4+", "P2 Developer gate, theme, role, legacy retirement"],
    ], [28 * mm, 142 * mm], s))

    # ── 8. Acceptance criteria ────────────────────────────────────────────
    story.append(Paragraph("<b>7.1 Acceptance criteria (Definition of Done)</b>", s["h2"]))
    story.append(bullets([
        "User can change card opacity, kill app, relaunch — value restored.",
        "User can switch HA profile from Settings without hunting login gear.",
        "Every toggle documents Device vs Home scope in subtitle.",
        "Room light “X ON”, room card badge, and home light quantity always match.",
        "No developer routes (V3 / TV Lab) visible unless Developer Mode is on.",
        "Areas/Entities reachable under Advanced → Diagnostics only.",
    ], s))

    # ── 9. Appendix ───────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section_banner("8. Appendix — SecureStore &amp; API Keys", s))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("<b>8.1 SecureStore keys (device)</b>", s["h2"]))
    story.append(table([
        ["Key", "Used for"],
        ["ha_profiles / ha_active_profile_id", "Connection profiles"],
        ["settings_show_family", "Show Family"],
        ["settings_auto_room_visit / _resume", "Auto-Room behaviors"],
        ["settings_show_voice_assistant", "Legacy voice widget"],
        ["settings_show_preference_button", "Global preference CTA"],
        ["face_id_enabled", "Biometric login"],
        ["api_key_* / active_ai_model", "AI providers"],
        ["room_reorder_config", "Room list order"],
        ["room_scenes_show_prefs_{areaId}", "Per-room prefs override"],
        ["is_logged_in / logged_in_user / …", "Session + biometric resume"],
    ], [70 * mm, 100 * mm], s))

    story.append(Paragraph("<b>8.2 Admin API endpoints used by Settings</b>", s["h2"]))
    story.append(table([
        ["Endpoint", "Used for"],
        ["GET/POST /api/config", "Still-open reminder + home config"],
        ["GET/POST /api/monitor", "Ignored / preferenced entities"],
        ["GET/POST/DELETE /api/alerts", "Alert rules"],
        ["POST /api/preferences/analyze", "My Preferences"],
        ["GET /api/preferences/get-all", "Learned preferences"],
        ["POST /api/notifications/send", "Test push"],
    ], [70 * mm, 100 * mm], s))

    story.append(Paragraph("<b>8.3 Code map (quick reference)</b>", s["h2"]))
    story.append(bullets([
        "Settings UI: <b>components/DashboardV2/SettingsView.jsx</b>",
        "Card appearance: <b>OpacitySettingsModal.jsx</b>",
        "Profiles: <b>app/login.jsx</b>, <b>services/profile.js</b>, <b>utils/storage.js</b>",
        "Light counting (related consistency): <b>utils/lightCapabilities.js</b>",
        "Push: <b>services/notifications.js</b>",
    ], s))

    story.append(Spacer(1, 10 * mm))
    end = Table([[Paragraph(
        "<b>End of document.</b> For implementation, start with P0-1 and P0-2 — they unlock "
        "the highest user-visible value with the least architectural risk.",
        s["callout"],
    )]], colWidths=[W])
    end.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 1, TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(end)

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="AppV1 Settings — Audit & Enhancement Plan",
        author="AppV1 Product / Engineering",
    )
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"Wrote {OUT}")
    return OUT


if __name__ == "__main__":
    build()
