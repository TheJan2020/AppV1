#!/usr/bin/env python3
"""AppV1 dashboard-v2 HOME tab — what first appears after load."""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
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

OUT = Path(__file__).resolve().parent / "AppV1_Home_Page_First_Load.pdf"

NAVY = colors.HexColor("#0F172A")
TEAL = colors.HexColor("#0F766E")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")
ALT = colors.HexColor("#F8FAFC")
BORDER = colors.HexColor("#E2E8F0")
PURPLE = colors.HexColor("#6D28D9")
AMBER = colors.HexColor("#B45309")


def S():
    return {
        "cover": ParagraphStyle(
            "cover", fontName="Helvetica-Bold", fontSize=22, leading=28,
            textColor=NAVY, alignment=TA_CENTER, spaceAfter=10,
        ),
        "sub": ParagraphStyle(
            "sub", fontName="Helvetica", fontSize=11, leading=15,
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1", fontName="Helvetica-Bold", fontSize=14, leading=18,
            textColor=NAVY, spaceBefore=4, spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
            textColor=TEAL, spaceBefore=10, spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=9.5, leading=13,
            textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "bullet", fontName="Helvetica", fontSize=9.5, leading=12.5,
            textColor=SLATE, spaceAfter=2,
        ),
        "cell": ParagraphStyle(
            "cell", fontName="Helvetica", fontSize=8.2, leading=11, textColor=SLATE,
        ),
        "cellb": ParagraphStyle(
            "cellb", fontName="Helvetica-Bold", fontSize=8.2, leading=11, textColor=NAVY,
        ),
        "callout": ParagraphStyle(
            "callout", fontName="Helvetica", fontSize=9.5, leading=13, textColor=NAVY,
        ),
    }


def hf(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    y = A4[1] - 11 * mm
    canvas.line(18 * mm, y, A4[0] - 18 * mm, y)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, y + 2 * mm, "AppV1 — Home page (dashboard-v2) first load")
    canvas.drawRightString(A4[0] - 18 * mm, y + 2 * mm, date.today().isoformat())
    canvas.line(18 * mm, 11 * mm, A4[0] - 18 * mm, 11 * mm)
    canvas.drawCentredString(A4[0] / 2, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


def banner(title, s, color=TEAL):
    t = Table(
        [[Paragraph(title, ParagraphStyle(
            "b", fontName="Helvetica-Bold", fontSize=11, textColor=colors.white, leading=14,
        ))]],
        colWidths=[174 * mm],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def bullets(items, s):
    return ListFlowable(
        [ListItem(Paragraph(i, s["bullet"]), leftIndent=8, bulletColor=TEAL) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=12,
        bulletFontName="Helvetica",
        bulletFontSize=9,
        spaceBefore=2,
        spaceAfter=6,
    )


def table(headers, rows, s, widths=None):
    if widths is None:
        widths = [174 * mm / len(headers)] * len(headers)
    data = [[Paragraph(h, s["cellb"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), s["cell"]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ALT))
    t.setStyle(TableStyle(style))
    return t


def callout(text, s, color=PURPLE):
    t = Table([[Paragraph(text, s["callout"])]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F3FF")),
        ("BOX", (0, 0), (-1, -1), 0.8, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def build():
    s = S()
    story = []

    story.append(Spacer(1, 22 * mm))
    story.append(Paragraph("Primewave AppV1", s["sub"]))
    story.append(Paragraph("Home page — what appears first after load", s["cover"]))
    story.append(Paragraph(
        "Only the dashboard-v2 <b>Home</b> tab (the screen you see after splash). "
        "Top-to-bottom sections, the skeleton → real-content switch, and the "
        "functions / APIs each block needs.",
        s["sub"],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"Generated {date.today().isoformat()}  ·  app/dashboard-v2.jsx", s["sub"]))
    story.append(Spacer(1, 8 * mm))
    story.append(callout(
        "<b>Screen:</b> Home tab of dashboard-v2. Not login, not splash, not Rooms/CCTV/Settings tabs. "
        "File: <font face='Courier'>AppV1/app/dashboard-v2.jsx</font> — block marked "
        "<font face='Courier'>===== HOME TAB =====</font>.",
        s,
    ))
    story.append(PageBreak())

    # ── What you see ───────────────────────────────────────────────────────
    story.append(banner("1. What you see, top to bottom", s))
    story.append(Paragraph(
        "After splash, dashboard-v2 mounts with Home as the default tab. "
        "Until data is ready you see grey shimmer skeletons in the same layout. "
        "Then the real blocks swap in together (cameras can lag a moment longer).",
        s["body"],
    ))
    story.append(table(
        ["Order on screen", "Component", "What it is"],
        [
            ["Chrome (always)", "TabBar (phone) or TabletSidebar (landscape)",
             "Home / Rooms / CCTV / Butler / Settings. Visible even while home is skeleton."],
            ["1. Header", "HeaderV2",
             "Greeting + name, weather/city, indoor temp, humidity, bell (unread count), mic (Butler)."],
            ["2. Status row", "StatusBadges",
             "Locks pill (dots + All locked / N unlocked) + lights-on count + AC-on count."],
            ["3. Optional people", "PersonBadges",
             "Only if Settings → show family is on. person.* photos + active alert chips."],
            ["4. Health banner", "HaSystemBanner",
             "Only if HA or admin is down (shown after a 10s delay). Usually empty."],
            ["5. Quick scenes", "QuickScenes",
             "Up to 4 scene cards from admin. Tap runs scene.turn_on."],
            ["6. Home Access", "HomeAccess",
             "Lock pills + garage pills (selected in admin Home Access)."],
            ["7. Rooms", "RoomsList",
             "Parent room cards: photo, name, lights/AC/cover/door badges. Phone: horizontal strip. Tablet: 6-up grid."],
            ["8. Cameras", "HomeCameraStrip",
             "Live thumbnails (Frigate or HA camera fallback). Extra wait: Frigate config attempt."],
        ],
        s,
        widths=[32 * mm, 40 * mm, 102 * mm],
    ))

    # ── Two stages ─────────────────────────────────────────────────────────
    story.append(banner("2. Two stages of first paint", s, PURPLE))
    story.append(Paragraph("2.1 Stage A — skeletons (you are waiting)", s["h2"]))
    story.append(bullets([
        "If the HA profile is not yet read from SecureStore: full-page <b>DashboardSkeleton</b>.",
        "Once <font face='Courier'>connectionConfig.loaded</font> is true: a ScrollView of "
        "<b>HeaderSkeleton, ScenesSkeleton, HomeAccessSkeleton, RoomsSkeleton, CamerasSkeleton</b>.",
        "This is <font face='Courier'>revealStep === 0</font>.",
    ], s))
    story.append(Paragraph("2.2 Stage B — real home (first content you recognise)", s["h2"]))
    story.append(Paragraph(
        "One effect sets <font face='Courier'>revealStep = 5</font> in a single jump "
        "(not 1, then 2, then 3…). So header, badges, scenes, home access, and rooms "
        "appear <b>at the same time</b>. The camera strip stays on CamerasSkeleton until "
        "Frigate config has been tried.",
        s["body"],
    ))
    story.append(table(
        ["Must be true", "Code flag", "Where it comes from"],
        [
            ["At least one HA entity", "entities.length &gt; 0",
             "HA WebSocket get_states after auth"],
            ["Quick-scenes request finished (ok or fail)", "scenesFetched",
             "GET {admin}/api/quick-scenes"],
            ["Home Access request finished (ok or fail)", "homeAccessFetched",
             "GET {admin}/api/home-access"],
        ],
        s,
        widths=[62 * mm, 40 * mm, 72 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(callout(
        "<b>Exception:</b> if the app was opened from a push, "
        "<font face='Courier'>alertNotif</font> forces revealStep = 5 immediately "
        "so the alert modal can show on top of home.",
        s,
        AMBER,
    ))

    # ── Network for home ───────────────────────────────────────────────────
    story.append(banner("3. What is fetched so those blocks can render", s))
    story.append(Paragraph(
        "All of this starts as soon as dashboard-v2 has the active profile "
        "(HA URL, token, admin URL). Home does not wait for every call — only the three flags above.",
        s["body"],
    ))

    story.append(Paragraph("3.1 Home Assistant (one WebSocket)", s["h2"]))
    story.append(Paragraph(
        "<font face='Courier'>new HAService(url, token)</font> → "
        "<font face='Courier'>connect()</font> → auth → then <b>Promise.all</b>:",
        s["body"],
    ))
    story.append(table(
        ["HA call", "Function", "Home UI that uses it"],
        [
            ["auth", "HAService.sendAuth()", "Unblocks everything else"],
            ["subscribe_events state_changed", "after auth_ok", "Live updates after first paint (lights, locks, garage…)"],
            ["get_states", "getStates()", "Header weather/temp, badges, locks, rooms, people, alarm"],
            ["get_config", "getConfig()", "Header cityName (location_name)"],
            ["device_registry/list", "getDeviceRegistry()", "Which devices belong to which room"],
            ["entity_registry/list", "getEntityRegistry()", "Entity → area; room cards + home locks fallback"],
            ["area_registry/list", "getAreaRegistry()", "Room list names / photos / parent rooms"],
            ["floor_registry/list", "getFloorRegistry()", "Not used on Home strip (used on Rooms tab)"],
            ["category_registry/list", "getCategoryRegistry()", "Loaded; not drawn on Home"],
            ["config_entries/get", "getConfigEntries()", "Music Assistant ids — room media, not Home first paint"],
        ],
        s,
        widths=[48 * mm, 48 * mm, 78 * mm],
    ))

    story.append(Paragraph("3.2 Admin APIs that the Home tab actually needs", s["h2"]))
    story.append(table(
        ["API", "Function", "Home section"],
        [
            ["GET /api/config", "initial-load fetch → setBadgeConfig",
             "Which rooms to show (selected_areas), selected_cameras, camera_sensors, locks_armed"],
            ["GET /api/quick-scenes", "fetchMappings() → setAllowedQuickScenes + scenesFetched",
             "Quick scene cards (max 4). Reveal gate."],
            ["GET /api/home-access", "fetchMappings() → selectedLockIds / selectedCoverIds + homeAccessFetched",
             "Which locks + garages appear. Reveal gate."],
            ["GET /api/covers", "fetchMappings / initial-load → coverMappings",
             "Garage pills (coverType === garage) + duration"],
            ["GET /api/lock-passage", "fetchMappings() → lockPassageConfigs",
             "Lock dots: unlocked if lock OR door sensor is on"],
            ["GET /api/sensors", "fetchMappings → sensorMappings",
             "Room door badges; doorsOpen count"],
            ["GET /api/monitored-entities?type=light + /api/light-types",
             "fetchEnrichedLightMappings()",
             "Not required to show room cards; used when you open a room"],
            ["GET /api/monitored-entities?type=media_player", "fetchMappings()",
             "Room media grouping — not a Home strip item"],
            ["GET /api/climate-mappings", "fetchMappings()",
             "Not drawn on Home"],
            ["GET /api/alerts", "setAlertRules",
             "PersonBadges alert chips (if family row is on)"],
            ["GET /api/entities", "monitored/ignored refs",
             "Not drawn; used for in-app notification filter"],
            ["GET /api/room-tracking/lookup", "setRoomTrackingLookup",
             "May auto-open a RoomSheet after home appears"],
            ["GET /api/notifications/history + /log", "useNotifications()",
             "Bell unread badge in header"],
            ["GET Frigate config (proxied)", "FrigateService.getConfig()",
             "Camera strip. Home does not wait except the strip’s own skeleton."],
            ["GET /api/cameras", "HA camera fallback",
             "Camera strip if Frigate returned nothing"],
            ["POST /api/sessions/heartbeat", "startHeartbeat()",
             "Invisible; session tracking"],
        ],
        s,
        widths=[58 * mm, 50 * mm, 66 * mm],
    ))

    # ── Per section ────────────────────────────────────────────────────────
    story.append(banner("4. Each Home block — data + functions", s))

    story.append(Paragraph("4.1 HeaderV2", s["h2"]))
    story.append(bullets([
        "<b>Greeting / name</b> — route params userName (from splash SecureStore logged_in_user).",
        "<b>Weather</b> — first entity whose id starts with <font face='Courier'>weather.</font> "
        "(temperature, state → icon).",
        "<b>City</b> — HA get_config location_name (cityName).",
        "<b>Humidity</b> — weather.attributes.humidity, else sensor.*humidity.",
        "<b>Indoor temp</b> — sensor with indoor/room + temp in the id, else climate.current_temperature.",
        "<b>Bell</b> — unreadCount from useNotifications (history + log APIs).",
        "<b>Mic</b> — does not load Butler on appear; only canOpenButlerCall() when tapped.",
    ], s))

    story.append(Paragraph("4.2 StatusBadges", s["h2"]))
    story.append(bullets([
        "<b>Lock dots</b> — all <font face='Courier'>lock.*</font> entities (up to 6). Lit if lock is unlocked/open "
        "OR its passage sensor is on (lockPassageConfigs).",
        "<b>Lights count</b> — sum of room-card activeLights (same rule as room badges: countable units, not master controller).",
        "<b>AC count</b> — climate entities that are not off/unavailable, grouped by selected parent rooms "
        "(getAllActiveDevices('ac')).",
        "Taps: locks → LocksModal; lights/AC → DevicesToggleModal. Those modals are not loaded as visible UI until tap.",
    ], s))

    story.append(Paragraph("4.3 QuickScenes", s["h2"]))
    story.append(bullets([
        "IDs from GET /api/quick-scenes, matched to live HA scene entities, sliced to 4.",
        "Function on tap: handleScenePress → callService(scene, turn_on).",
        "Edit pencil (if used) hits the same admin API; not required for first appear.",
    ], s))

    story.append(Paragraph("4.4 HomeAccess", s["h2"]))
    story.append(bullets([
        "<b>homeLocks</b> — lock.* filtered by selectedLockIds from /api/home-access (or by room area if that list is null).",
        "<b>homeCovers</b> — coverMappings where coverType is garage, filtered by selectedCoverIds, joined to live HA state.",
        "Control: callService('lock', lock|unlock) and callService('cover', open_cover|close_cover|stop_cover).",
        "Shutters are not on this home strip (they live inside room curtains).",
    ], s))

    story.append(Paragraph("4.5 RoomsList", s["h2"]))
    story.append(bullets([
        "<b>getRoomsWithCounts()</b> — areas from getSelectedAreasForDashboard(registryAreas, badgeConfig), "
        "then filterParentRoomsForDashboard (hides sub-rooms like Toilet from the home strip).",
        "Per room: getRoomEntities(...) using devices, entity registry, live states, sensorMappings, coverMappings, mediaMappings.",
        "Badges: activeLights, activeAC, activeCovers, activeDoors, presence.",
        "Order: savedRoomOrder from SecureStore room_reorder_config.",
        "Photos: HA area picture via haUrl + token (expo-image).",
        "Tap: handleRoomPress → setRoomPageBootstrap + navigate to /room (or RoomSheet on home depending on tab).",
    ], s))

    story.append(Paragraph("4.6 HomeCameraStrip", s["h2"]))
    story.append(bullets([
        "Stays on CamerasSkeleton until <font face='Courier'>frigateConfigResolved</font> "
        "(getConfig success or fail).",
        "Cameras: Frigate getConfig().cameras, else GET /api/cameras.",
        "Which ones show: badgeConfig.selected_cameras.",
        "Each card: WebView of FrigateService.getStreamUrl() or getHASnapshotUrl().",
        "Overlays: camera_sensors from /api/config + live binary_sensor entities.",
        "Home page does <b>not</b> wait for streams before showing header/rooms — only the strip waits.",
    ], s))

    # ── Local store ────────────────────────────────────────────────────────
    story.append(banner("5. Local settings read on this page (SecureStore)", s))
    story.append(table(
        ["Key", "Effect on Home"],
        [
            ["ha_active_profile_id + ha_profiles", "HA URL, token, admin URL — nothing else can load without this"],
            ["settings_show_family", "Show or hide PersonBadges"],
            ["settings_show_voice_assistant", "Mic in header (Butler)"],
            ["room_reorder_config", "Order of room cards"],
            ["settings_auto_room_visit / resume", "May open a room sheet after home is up (presence)"],
        ],
        s,
        widths=[62 * mm, 112 * mm],
    ))

    # ── Not first ──────────────────────────────────────────────────────────
    story.append(banner("6. Loaded in the same page, but not part of first Home content", s, AMBER))
    story.append(bullets([
        "Rooms tab, CCTV tab, Settings tab, Brain/Butler tab — mounted hidden or on first visit.",
        "RoomSheet / room route — only after you tap a room.",
        "LocksModal, DevicesToggleModal, SecurityControlModal, FrigateCameraModal, NotificationModal — on tap.",
        "Butler WebSocket / Gemini — only on mic tap (runButlerBackgroundSetup).",
        "Heartbeat, push token (from root layout), ignored-entity list — background.",
        "Light/media/climate mappings — needed inside a room, not to draw the home strip.",
    ], s))

    story.append(Spacer(1, 4 * mm))
    story.append(callout(
        "<b>What “first appear” means in code:</b> connectionConfig.loaded, then skeletons, then "
        "entities + scenesFetched + homeAccessFetched → revealStep 5. "
        "That is the moment header, badges, scenes, locks/garage, and rooms pop in. "
        "Camera thumbnails fill in when Frigate (or /api/cameras) answers.",
        s,
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="AppV1 Home page — first load",
        author="Primewave",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
