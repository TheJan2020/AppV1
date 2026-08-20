#!/usr/bin/env python3
"""Every function from Login tap / app open until Home page is fully shown.

Written to diagnose why skeleton stays up so long.
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
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parent / "AppV1_Home_Load_Functions.pdf"

NAVY = colors.HexColor("#0F172A")
TEAL = colors.HexColor("#0F766E")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")
ALT = colors.HexColor("#F8FAFC")
BORDER = colors.HexColor("#E2E8F0")
PURPLE = colors.HexColor("#6D28D9")
RED = colors.HexColor("#B91C1C")
AMBER = colors.HexColor("#B45309")
GREEN = colors.HexColor("#166534")


def S():
    return {
        "cover": ParagraphStyle(
            "cover", fontName="Helvetica-Bold", fontSize=20, leading=26,
            textColor=NAVY, alignment=TA_CENTER, spaceAfter=8,
        ),
        "sub": ParagraphStyle(
            "sub", fontName="Helvetica", fontSize=10.5, leading=14,
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=9.5, leading=13,
            textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=5,
        ),
        "h2": ParagraphStyle(
            "h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
            textColor=TEAL, spaceBefore=8, spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "bullet", fontName="Helvetica", fontSize=9.3, leading=12.5, textColor=SLATE, spaceAfter=2,
        ),
        "cell": ParagraphStyle(
            "cell", fontName="Helvetica", fontSize=7.7, leading=10.4, textColor=SLATE,
        ),
        "cellb": ParagraphStyle(
            "cellb", fontName="Helvetica-Bold", fontSize=7.7, leading=10.4, textColor=NAVY,
        ),
        "slow": ParagraphStyle(
            "slow", fontName="Helvetica-Bold", fontSize=7.7, leading=10.4, textColor=RED,
        ),
        "ok": ParagraphStyle(
            "ok", fontName="Helvetica-Bold", fontSize=7.7, leading=10.4, textColor=GREEN,
        ),
        "mid": ParagraphStyle(
            "mid", fontName="Helvetica-Bold", fontSize=7.7, leading=10.4, textColor=AMBER,
        ),
        "callout": ParagraphStyle(
            "callout", fontName="Helvetica", fontSize=9.3, leading=12.5, textColor=NAVY,
        ),
    }


def hf(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    y = A4[1] - 11 * mm
    canvas.line(16 * mm, y, A4[0] - 16 * mm, y)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, y + 2 * mm, "AppV1 — Functions until Home page load ends")
    canvas.drawRightString(A4[0] - 16 * mm, y + 2 * mm, date.today().isoformat())
    canvas.line(16 * mm, 11 * mm, A4[0] - 16 * mm, 11 * mm)
    canvas.drawCentredString(A4[0] / 2, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


def banner(title, s, color=TEAL):
    t = Table(
        [[Paragraph(title, ParagraphStyle(
            "b", fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.white, leading=13,
        ))]],
        colWidths=[178 * mm],
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
        [ListItem(Paragraph(i, s["bullet"]), leftIndent=6, bulletColor=TEAL) for i in items],
        bulletType="bullet", start="•", leftIndent=10,
        bulletFontName="Helvetica", bulletFontSize=9, spaceBefore=1, spaceAfter=5,
    )


def callout(text, s, color=PURPLE):
    t = Table([[Paragraph(text, s["callout"])]], colWidths=[178 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F3FF")),
        ("BOX", (0, 0), (-1, -1), 0.8, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def fn_table(rows, s):
    """rows: order, function, file, what, cost  (cost is SLOW/MED/fast)"""
    headers = ["#", "Function", "File", "What it does (until Home is shown)", "Cost"]
    widths = [10 * mm, 42 * mm, 36 * mm, 72 * mm, 18 * mm]
    cost_style = {"SLOW": s["slow"], "MED": s["mid"], "fast": s["ok"]}
    data = [[Paragraph(h, s["cellb"]) for h in headers]]
    for row in rows:
        cost = row[4]
        data.append([
            Paragraph(str(row[0]), s["cell"]),
            Paragraph(row[1], s["cellb"]),
            Paragraph(row[2], s["cell"]),
            Paragraph(row[3], s["cell"]),
            Paragraph(cost, cost_style.get(cost, s["cell"])),
        ])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ALT))
        if rows[i - 1][4] == "SLOW":
            style.append(("BACKGROUND", (4, i), (4, i), colors.HexColor("#FEE2E2")))
        elif rows[i - 1][4] == "MED":
            style.append(("BACKGROUND", (4, i), (4, i), colors.HexColor("#FEF3C7")))
    t.setStyle(TableStyle(style))
    return t


def build():
    s = S()
    story = []

    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph("Primewave AppV1", s["sub"]))
    story.append(Paragraph("Why Home feels slow — every function until the page is shown", s["cover"]))
    story.append(Paragraph(
        "From tapping Login (or opening the app) through Lottie → skeleton → real Home. "
        "Each function is listed in time order with what it is for and how expensive it is.",
        s["sub"],
    ))
    story.append(Paragraph(f"{date.today().isoformat()}  ·  dashboard-v2 Home tab", s["sub"]))
    story.append(Spacer(1, 6 * mm))
    story.append(callout(
        "<b>Load is “done”</b> when <font face='Courier'>revealStep = 5</font> "
        "(header, badges, scenes, Home Access, rooms are real) <b>and</b> "
        "<font face='Courier'>frigateConfigResolved</font> (camera strip leaves skeleton). "
        "Until then you only see shimmer.",
        s,
    ))
    story.append(PageBreak())

    # ── Why slow ───────────────────────────────────────────────────────────
    story.append(banner("0. Why the skeleton lasts so long (root causes)", s, RED))
    story.append(Paragraph(
        "The skeleton is not a decoration — Home is hidden on purpose until three things finish. "
        "Anything slower than those three keeps you on shimmer.",
        s["body"],
    ))
    story.append(bullets([
        "<b>Hard wait (reveal gate):</b> HA <font face='Courier'>get_states</font> must return "
        "<i>and</i> GET /api/quick-scenes <i>and</i> GET /api/home-access. The slowest of these three wins.",
        "<b>Lottie (app/index.jsx):</b> forced <b>2.2 seconds</b> even if SecureStore is instant. "
        "This runs on <b>app open</b> (route <font face='Courier'>/</font>), not inside dashboard-v2. "
        "After you tap Login, code goes <b>directly</b> to /dashboard-v2 — no second Lottie. "
        "If you see Lottie then skeleton, that Lottie was the splash before/during first navigation.",
        "<b>get_states is huge:</b> Home Assistant sends <i>every</i> entity (often 500–2000). "
        "Parsing that JSON on the phone is usually the longest wait.",
        "<b>Then JS work on the main thread:</b> getRoomsWithCounts → getRoomEntities for every room "
        "does .find() over the full entity list. That can freeze the UI after data arrives "
        "(skeleton stays, then a hitch, then the page pops in).",
        "<b>Extra parallel traffic (does not block reveal, but steals bandwidth/CPU):</b> "
        "~15 admin APIs, 7 more HA registry calls, Frigate config, notification history, heartbeat, light-icon SVG preload. "
        "Sensors and covers are fetched <b>twice</b>.",
        "<b>Cameras after reveal:</b> each HomeCameraStrip card starts a WebView stream. "
        "That can make the page feel unfinished even after rooms appear.",
    ], s))
    story.append(callout(
        "<b>SLOW</b> = likely seconds on a real phone &nbsp; "
        "<b>MED</b> = tens–hundreds of ms or extra network &nbsp; "
        "<b>fast</b> = local / tiny. "
        "Red rows are the ones to attack first.",
        s,
        AMBER,
    ))

    # ── Phase Lottie ───────────────────────────────────────────────────────
    story.append(banner("1. App open — Lottie splash (app/index.jsx)  ·  always on cold start", s, PURPLE))
    story.append(Paragraph(
        "Expo Router first screen is index. You see PrimeWave2.json until session check "
        "<b>and</b> 2200 ms have both finished. Then replace → login (no session) or dashboard-v2 (session).",
        s["body"],
    ))
    story.append(fn_table([
        ["1", "SplashScreen.preventAutoHideAsync", "_layout.jsx",
         "Keeps native splash up until fonts load.", "fast"],
        ["2", "useFonts (Clash Display × 6)", "_layout.jsx",
         "Blocks first JS frame until 6 OTF files are in memory.", "MED"],
        ["3", "preloadLocalLightIcons", "lightTypeAssets.js",
         "Reads 6 light SVGs from disk, tints white + black. Started here, not required for Home cards.", "MED"],
        ["4", "registerForPushNotificationsAsync", "notifications.js",
         "Permission, Expo token, POST /api/notifications/register. On first install adminUrl may be missing so this no-ops until login.", "MED"],
        ["5", "ScreenOrientation.lockAsync", "_layout.jsx",
         "Portrait lock on phones.", "fast"],
        ["6", "getLastNotificationResponseAsync", "_layout.jsx",
         "If launched from a push, stash it in NotifContext.", "fast"],
        ["7", "LottieView PrimeWave2.json", "index.jsx",
         "Plays branded animation. Hides native splash on layout.", "MED"],
        ["8", "setTimeout 2200 ms", "index.jsx MIN_SPLASH_MS",
         "Forces you to watch Lottie at least 2.2s even if login check is done.", "SLOW"],
        ["9", "SecureStore.getItemAsync × 4", "index.jsx",
         "is_logged_in, ha_active_profile_id, ha_profiles, logged_in_user — decide login vs dashboard.", "fast"],
        ["10", "router.replace", "index.jsx",
         "→ /login or /dashboard-v2 with userName, userId.", "fast"],
    ], s))

    # ── Login ──────────────────────────────────────────────────────────────
    story.append(banner("2. Tap Login (app/login.jsx handleLogin)  ·  only if you are on the login screen", s, PURPLE))
    story.append(Paragraph(
        "After success this does <font face='Courier'>router.replace('/dashboard-v2')</font>. "
        "It does <b>not</b> play Lottie again.",
        s["body"],
    ))
    story.append(fn_table([
        ["11", "handleLogin", "login.jsx",
         "Validates fields, sets isLoggingIn spinner on the button.", "fast"],
        ["12", "validateCredentials", "services/auth.js",
         "Two sequential HTTP calls to HA: POST /auth/login_flow then POST /auth/login_flow/{id} with username/password. Network RTT × 2.", "SLOW"],
        ["13", "SecureStore get profiles", "login.jsx",
         "Read active profile name for the account record.", "fast"],
        ["14", "upsertAccountAndActivate", "services/accounts.js",
         "Writes saved_accounts, active_account_id, is_logged_in, logged_in_user, Face ID username/password.", "MED"],
        ["15", "activateAccount", "accounts.js",
         "Sets ha_active_profile_id + session flags (called from upsert).", "fast"],
        ["16", "registerForPushNotificationsAsync", "notifications.js",
         "Fired again now that adminUrl exists (layout ran too early on fresh install). GET token + POST register. Does not block navigation.", "MED"],
        ["17", "getAdminUrl", "utils/storage.js",
         "Used inside push register to find backend URL.", "fast"],
        ["18", "router.replace /dashboard-v2", "login.jsx",
         "Unmounts login, mounts DashboardV2. Skeleton period starts here.", "fast"],
    ], s))

    # ── Dashboard mount ────────────────────────────────────────────────────
    story.append(banner("3. Dashboard mounts — you now see SKELETONS  (this is the long wait)", s, RED))
    story.append(Paragraph(
        "DashboardV2 first render: connectionConfig.loaded is false → full DashboardSkeleton. "
        "Then profile loads → per-section skeletons (header/scenes/access/rooms/cameras) until the reveal gate.",
        s["body"],
    ))
    story.append(Paragraph("3.1 Local profile + settings (parallel, first tick)", s["h2"]))
    story.append(fn_table([
        ["19", "loadConnectionConfig", "dashboard-v2.jsx",
         "Reads ha_active_profile_id + ha_profiles. Fills url, token, adminUrl, loaded=true. Unlocks all network.", "fast"],
        ["20", "SecureStore settings × 6", "dashboard-v2.jsx mount effect",
         "show family, auto room visit/resume, voice assistant, preference button, room_reorder_config.", "fast"],
        ["21", "getButlerBackendUrl", "butlerBackend.js",
         "Builds adminUrl/api/butler. No socket. Not needed for Home paint.", "fast"],
        ["22", "useDeviceType", "hooks/useDeviceType.js",
         "Phone vs tablet column counts for skeletons and grids.", "fast"],
        ["23", "useNotifications", "hooks/useNotifications.js",
         "Starts fetch of history+log once adminUrl exists (see 48–49).", "fast"],
        ["24", "useHaSystemHealth", "hooks/useHaSystemHealth.js",
         "Watches haStatus/adminStatus; banner only after 10s of failure.", "fast"],
    ], s))

    story.append(Paragraph("3.2 Home Assistant WebSocket — usually the #1 delay", s["h2"]))
    story.append(fn_table([
        ["25", "new HAService(url, token)", "services/ha.js",
         "Builds wss://…/api/websocket. Subscribes to AppState for later reconnect.", "fast"],
        ["26", "HAService.connect", "ha.js",
         "Opens WebSocket. Waits for TCP + TLS to HA. Slow on remote / weak Wi‑Fi.", "SLOW"],
        ["27", "sendAuth", "ha.js",
         "Sends access_token when HA says auth_required.", "fast"],
        ["28", "handleMessage auth_ok", "ha.js",
         "Marks connected, notifies dashboard, then subscribe_events.", "fast"],
        ["29", "subscribe_events state_changed", "ha.js",
         "Live stream for the rest of the session. Not required to leave skeleton.", "fast"],
        ["30", "getStates", "ha.js",
         "HA command get_states. Returns ALL entities. Largest payload. Dashboard will not reveal without this.", "SLOW"],
        ["31", "getConfig", "ha.js",
         "HA location_name → header city. In the same Promise.all as get_states.", "MED"],
        ["32", "getDeviceRegistry", "ha.js",
         "config/device_registry/list — devices → rooms.", "MED"],
        ["33", "getEntityRegistry", "ha.js",
         "config/entity_registry/list — often as large as get_states.", "SLOW"],
        ["34", "getCategoryRegistry", "ha.js",
         "Loaded in the same batch. Not drawn on Home.", "MED"],
        ["35", "getAreaRegistry", "ha.js",
         "Rooms list. Required for room cards.", "MED"],
        ["36", "getFloorRegistry", "ha.js",
         "Floors. Home strip does not use floors; Rooms tab does.", "fast"],
        ["37", "getConfigEntries", "ha.js",
         "Music Assistant entry ids. Failure ignored. Not needed for Home first paint.", "MED"],
        ["38", "Promise.all then setState × 8", "dashboard-v2.jsx",
         "One React batch: entities, city, devices, registries, floors, MA ids. Triggers the expensive room memos.", "SLOW"],
    ], s))

    story.append(Paragraph("3.3 Admin APIs — all fire together (fetchMappings + initial-load)", s["h2"]))
    story.append(Paragraph(
        "Two useEffects both hit the admin server. <b>Bold = reveal gate.</b> "
        "Sensors and covers are requested in both effects (duplicate).",
        s["body"],
    ))
    story.append(fn_table([
        ["39", "fetchMappings", "dashboard-v2.jsx",
         "Aborts previous, starts the mapping fan-out. Resets reveal to 0 on first load.", "fast"],
        ["40", "GET /api/quick-scenes", "fetchMappings",
         "IDs for the 4 scene cards. Sets scenesFetched. GATE.", "SLOW"],
        ["41", "fetchEnrichedLightMappings", "lightMappingsClient.js",
         "Parallel GET monitored-entities?type=light AND GET /api/light-types, then enrichLightMappings.", "MED"],
        ["42", "enrichLightMappings / inferLightTypeFromEntity", "lightTypeInference.js",
         "Guess icon type from entity_id keywords for every mapped light.", "MED"],
        ["43", "preloadLocalLightIcons", "lightTypeAssets.js",
         "Called again after light-types. Disk SVG + tintSvgXml.", "MED"],
        ["44", "GET /api/monitored-entities?type=media_player", "fetchMappings",
         "TV mappings. Not needed to show Home rooms.", "MED"],
        ["45", "GET /api/sensors", "fetchMappings + initial-load DUPLICATE",
         "Door types for room badges. Fetched twice.", "MED"],
        ["46", "GET /api/covers", "fetchMappings + initial-load DUPLICATE",
         "Garage types + windows. Fetched twice.", "MED"],
        ["47", "GET /api/climate-mappings", "fetchMappings",
         "AC dampers. Not on Home strip.", "MED"],
        ["48", "GET /api/home-access", "fetchMappings",
         "Which locks + garages. Sets homeAccessFetched. GATE.", "SLOW"],
        ["49", "GET /api/lock-passage", "fetchMappings",
         "Lock ↔ door sensor for StatusBadges dots.", "MED"],
        ["50", "GET /api/config", "initial-load effect",
         "selected_areas, selected_cameras, locks_armed, badge entities. Needed for which rooms to show.", "SLOW"],
        ["51", "GET /api/alerts", "initial-load",
         "PersonBadges alert chips.", "MED"],
        ["52", "GET /api/entities", "initial-load",
         "Monitored/ignored sets for notifications. Not drawn.", "MED"],
        ["53", "GET /api/room-tracking/lookup", "initial-load",
         "Presence → room. May open a sheet after Home is up.", "MED"],
        ["54", "GET /api/notifications/history", "useNotifications.fetchNotifications",
         "Bell unread. Promise.allSettled with log.", "MED"],
        ["55", "GET /api/notifications/log", "useNotifications",
         "Lock/garage push log for the bell.", "MED"],
        ["56", "startHeartbeat → POST /api/sessions/heartbeat", "heartbeat.js",
         "Immediately then every 30s. Device id + user. Invisible.", "MED"],
        ["57", "getIosIdForVendorAsync / getAndroidId", "heartbeat.js getDeviceId",
         "Used inside heartbeat.", "fast"],
    ], s))

    story.append(Paragraph("3.4 Frigate / cameras (strip skeleton only)", s["h2"]))
    story.append(fn_table([
        ["58", "new FrigateService", "services/frigate.js",
         "Points at admin proxy, not a raw Frigate IP.", "fast"],
        ["59", "FrigateService.getConfig", "frigate.js",
         "GET {admin}/api/frigate/config. Sets cameras. On fail may Alert. Always sets frigateConfigResolved.", "SLOW"],
        ["60", "GET /api/cameras", "dashboard-v2.jsx",
         "HA camera fallback if Frigate list is empty.", "MED"],
        ["61", "getStreamUrl / getHASnapshotUrl", "frigate.js",
         "Called when HomeCameraStrip mounts — one WebView per visible camera.", "SLOW"],
    ], s))

    # ── JS after data ──────────────────────────────────────────────────────
    story.append(banner("4. After data arrives — JS that builds the Home you see (can hitch the skeleton)", s, AMBER))
    story.append(Paragraph(
        "When Promise.all and the two GATE APIs finish, React re-renders. These functions run on the UI thread. "
        "If get_states was large, this is the freeze right before the page appears.",
        s["body"],
    ))
    story.append(fn_table([
        ["62", "getSelectedAreasForDashboard", "utils/roomAreas.js",
         "Intersect HA areas with /api/config selected_areas.", "fast"],
        ["63", "filterParentRoomsForDashboard", "roomAreas.js",
         "Hide sub-rooms (Toilet, etc.) from the Home strip.", "fast"],
        ["64", "getRoomAreaGroup", "roomAreas.js",
         "Merge child-area stats onto parent room cards.", "fast"],
        ["65", "getRoomsWithCounts", "dashboard-v2.jsx",
         "For every parent area, compute badges. Calls getRoomEntities per room. Main CPU cost.", "SLOW"],
        ["66", "getRoomEntities", "utils/roomHelpers.js",
         "Filter registry by area, then .find() live state for each entity. Nested loops over all entities × rooms.", "SLOW"],
        ["67", "inferSensorType / isRoomClimateSensor", "roomHelpers.js",
         "Door vs temp vs humidity for badges.", "fast"],
        ["68", "findCoverMapping / inferCoverLayer / isMasterCover", "coverWindows.js",
         "Garage vs curtain vs shutter while building rooms.", "fast"],
        ["69", "isMusicAssistantMediaPlayer / findLinkedRemote", "roomHelpers / tvRemote",
         "Split TV vs speakers. Extra .find on entities.", "MED"],
        ["70", "collectGroupedLightMemberIds", "lightCapabilities.js",
         "HA light groups so badge counts don’t double-count.", "MED"],
        ["71", "isLightCountableUnit / countActiveCountableLights", "lightCapabilities.js",
         "Lights-on number in StatusBadges = sum of room badges.", "MED"],
        ["72", "isMasterControllerLight / isLightGroupEntity", "lightCapabilities.js",
         "Skip master controller in counts.", "fast"],
        ["73", "getAllActiveDevices('ac')", "dashboard-v2.jsx",
         "AC-on chip. Walks areas × registry × entities.", "MED"],
        ["74", "homeLocks / homeCovers memos", "dashboard-v2.jsx",
         "Filter locks by home-access IDs; garages from coverMappings + live state.", "MED"],
        ["75", "quickScenesData memo", "dashboard-v2.jsx",
         "Match scene IDs to live entities, max 4.", "fast"],
        ["76", "weather / humidity / indoorTemp memos", "dashboard-v2.jsx",
         "Header climate line. .find on entities.", "fast"],
        ["77", "power / securityState memo", "dashboard-v2.jsx",
         "From badgeConfig entity ids.", "fast"],
        ["78", "buildEntityMap", "CameraSensorOverlay.js",
         "Map of all entities for camera overlays.", "MED"],
        ["79", "analyzeEntitiesHealth", "haEntityHealth.js",
         "Inside useHaSystemHealth — % unavailable.", "fast"],
        ["80", "HeaderV2 render", "HeaderV2.jsx",
         "Greeting, weather icon, temps, bell, mic.", "fast"],
        ["81", "StatusBadges render", "StatusBadges.jsx",
         "Lock dots + lights + AC chips.", "fast"],
        ["82", "PersonBadges render", "PersonBadges.jsx",
         "If showFamily. person.* pictures from HA /local/…", "MED"],
        ["83", "QuickScenes render", "QuickScenes.jsx",
         "Four SceneCards.", "fast"],
        ["84", "HomeAccess render", "HomeAccess.jsx",
         "Lock + garage pills (Reanimated).", "MED"],
        ["85", "RoomsList render", "RoomsList.jsx",
         "Room photos via expo-image (HA authenticated URLs).", "SLOW"],
        ["86", "HomeCameraStrip + CameraCard WebView", "HomeCameraStrip.jsx",
         "N live streams. Heavy after reveal.", "SLOW"],
        ["87", "TabBar / TabletSidebar", "TabBar.jsx",
         "Always visible under Home.", "fast"],
        ["88", "HaSystemBanner", "HaSystemBanner.jsx",
         "Usually nothing.", "fast"],
    ], s))

    # ── After reveal, still “load” ─────────────────────────────────────────
    story.append(banner("5. After Home appears — still running, not required to leave skeleton", s))
    story.append(fn_table([
        ["89", "HAService.subscribe state_changed", "dashboard-v2.jsx",
         "applyHaStateChangedEvent on every HA change. Keeps Home live.", "MED"],
        ["90", "applyHaStateChangedEvent / applyClimateServiceToEntity", "haEntityMerge.js",
         "Patch one entity in the array.", "fast"],
        ["91", "pushNotification", "dashboard-v2.jsx",
         "In-app list for monitored entities (locks/garage skipped — backend only).", "fast"],
        ["92", "navigateToPresenceRoom", "dashboard-v2.jsx",
         "May open RoomSheet if tracker matches. Feels like extra load.", "MED"],
        ["93", "AppState listener", "dashboard-v2.jsx",
         "On resume: fetchMappings again (no skeleton reset) + presence.", "MED"],
        ["94", "canOpenButlerCall / runButlerBackgroundSetup", "openButlerCall.js",
         "NOT called until mic tap. Not part of Home load.", "fast"],
        ["95", "callService", "dashboard-v2.jsx",
         "Only when you tap a scene/lock/garage. Optimistic state for on/off.", "fast"],
    ], s))

    # ── Gate recap ─────────────────────────────────────────────────────────
    story.append(banner("6. Exact “page load ended” condition", s, TEAL))
    story.append(bullets([
        "connectionConfig.loaded === true (profile from SecureStore).",
        "entities.length &gt; 0  ← function <b>getStates</b> (#30).",
        "scenesFetched === true  ← GET /api/quick-scenes (#40), even if empty or error.",
        "homeAccessFetched === true  ← GET /api/home-access (#48), even if error.",
        "Then revealStep jumps 0 → 5: Header, StatusBadges, QuickScenes, HomeAccess, RoomsList swap from skeleton to real.",
        "Camera strip: extra wait on frigateConfigResolved (#59). Then WebViews (#86).",
        "Lottie 2.2s (#8) is <b>before</b> this if you came from app open via index.jsx.",
    ], s))
    story.append(Spacer(1, 3 * mm))
    story.append(callout(
        "<b>Fastest wins if you later optimize:</b> (1) don’t wait 2.2s on Lottie, "
        "(2) don’t block Home on home-access/quick-scenes — show rooms from HA registries first, "
        "(3) shrink get_states or index entities by id so getRoomEntities is O(1) not O(n²), "
        "(4) stop duplicate /api/sensors and /api/covers, "
        "(5) defer camera WebViews until after first paint.",
        s,
        AMBER,
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="AppV1 functions until Home page load ends",
        author="Primewave",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
