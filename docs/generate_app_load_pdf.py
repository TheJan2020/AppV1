#!/usr/bin/env python3
"""AppV1 cold-start: what the app loads, in order, with functions and APIs."""

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

OUT = Path(__file__).resolve().parent / "AppV1_App_Load_Startup.pdf"

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
    b = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle(
            "cover", fontName="Helvetica-Bold", fontSize=24, leading=30,
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
        "mono": ParagraphStyle(
            "mono", fontName="Courier", fontSize=8, leading=11, textColor=SLATE,
        ),
        "callout": ParagraphStyle(
            "callout", fontName="Helvetica", fontSize=9.5, leading=13, textColor=NAVY,
        ),
        "small": ParagraphStyle(
            "small", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED,
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
    canvas.drawString(18 * mm, y + 2 * mm, "AppV1 — What loads when the app starts")
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
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
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

    # ── Cover ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 28 * mm))
    story.append(Paragraph("Primewave AppV1", s["sub"]))
    story.append(Paragraph("What loads when the app starts", s["cover"]))
    story.append(Paragraph(
        "Cold-start sequence, functions, SecureStore keys, Home Assistant "
        "WebSocket commands, and admin APIs — from native splash to home screen.",
        s["sub"],
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(f"Generated {date.today().isoformat()}  ·  Source: AppV1 code", s["sub"]))
    story.append(Spacer(1, 10 * mm))
    story.append(callout(
        "<b>Entry path:</b> Expo Router → <font face='Courier'>app/_layout.jsx</font> "
        "→ <font face='Courier'>app/index.jsx</font> (Lottie splash) → either "
        "<font face='Courier'>/login</font> or <font face='Courier'>/dashboard-v2</font>. "
        "Logged-in users land on dashboard-v2. The home screen is shown only after "
        "HA entity states plus quick-scenes and home-access APIs have returned.",
        s,
    ))
    story.append(PageBreak())

    # ── Overview ───────────────────────────────────────────────────────────
    story.append(banner("1. Startup sequence (high level)", s))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "These phases overlap. Fonts, push registration, and icon preload start in "
        "the root layout while the splash animation plays. Dashboard then fires "
        "Home Assistant, admin mappings, Frigate, notifications, and heartbeat in parallel.",
        s["body"],
    ))
    story.append(table(
        ["Phase", "Where", "Blocks UI?", "Outcome"],
        [
            ["0. Native shell", "Expo / iOS / Android", "Yes — OS splash",
             "JS bundle starts. Native splash stays until fonts + Lottie hide it."],
            ["1. Root layout", "app/_layout.jsx", "Yes — until fonts",
             "Fonts, crash handler, push, orientation, light-icon preload, notification tap capture."],
            ["2. Splash route", "app/index.jsx", "Yes — min 2.2s",
             "Lottie PrimeWave2.json. Session check in SecureStore. Then login or dashboard."],
            ["3. Session gate", "index.jsx → router.replace", "No extra wait",
             "Valid session → /dashboard-v2. Otherwise → /login."],
            ["4. Dashboard boot", "app/dashboard-v2.jsx", "Skeletons until ready",
             "Profile, HA WebSocket, registries, admin APIs, Frigate, notifications, heartbeat."],
            ["5. Home reveal", "revealStep → 5", "Home hidden until gate",
             "Shown when entities.length &gt; 0 AND quick-scenes AND home-access have finished."],
        ],
        s,
        widths=[28 * mm, 38 * mm, 32 * mm, 76 * mm],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Tablet vs phone is decided later with <font face='Courier'>useDeviceType()</font> "
        "(short side ≥ 768). Both use dashboard-v2; layout columns change, it is not a separate load path.",
        s["body"],
    ))

    # ── Phase 1 ────────────────────────────────────────────────────────────
    story.append(banner("2. Phase 1 — Root layout (app/_layout.jsx)", s))
    story.append(Paragraph(
        "This file wraps every screen. It runs once per process, before splash or dashboard.",
        s["body"],
    ))
    story.append(table(
        ["Function / API", "File", "What it does on load"],
        [
            ["SplashScreen.preventAutoHideAsync()", "expo-splash-screen",
             "Keeps the native splash visible until fonts are ready."],
            ["useFonts({ ClashDisplay-* })", "expo-font / _layout.jsx",
             "Loads 6 Clash Display OTF weights. Until this finishes, RootLayout returns null."],
            ["preloadLocalLightIcons()", "utils/lightTypeAssets.js",
             "Reads bundled light SVGs (up lights, spot, chandelier, track, coved LED, generic bulb) and tints them for white/black."],
            ["registerForPushNotificationsAsync()", "services/notifications.js",
             "Android channel, permission prompt, Expo push token, POST /api/notifications/register."],
            ["ScreenOrientation.lockAsync(PORTRAIT_UP)", "expo-screen-orientation",
             "Phones only (short side &lt; 768). Tablets stay free to rotate."],
            ["Notifications.getLastNotificationResponseAsync()", "expo-notifications",
             "Cold-start: if the user launched the app by tapping a push, capture title/body/category into NotifContext."],
            ["addNotificationResponseReceivedListener()", "expo-notifications",
             "Later taps while running/suspended also go into NotifContext."],
            ["ErrorUtils.setGlobalHandler()", "_layout.jsx",
             "Logs fatal/non-fatal JS crashes before the default handler."],
            ["SplashScreen.hideAsync()", "_layout onLayout",
             "Hides native splash once fontsLoaded is true."],
        ],
        s,
        widths=[58 * mm, 42 * mm, 74 * mm],
    ))
    story.append(Paragraph(
        "Also mounted here: <b>NotifContext.Provider</b>, <b>ErrorBoundary</b>, "
        "<b>GestureHandlerRootView</b>, Expo Router <b>Stack</b> (index, login, dashboard-v2, room, …), "
        "and on iOS a non-interactive purple shadow overlay.",
        s["body"],
    ))

    # ── Phase 2 ────────────────────────────────────────────────────────────
    story.append(banner("3. Phase 2 — Splash screen (app/index.jsx)", s))
    story.append(Paragraph(
        "Minimum display time is <b>2200 ms</b> so the Lottie animation can play even if SecureStore is instant.",
        s["body"],
    ))
    story.append(table(
        ["Function / key", "Purpose"],
        [
            ["LottieView source=PrimeWave2.json", "Full-screen branded animation (loop, speed 0.6). Hides native splash on layout / onAnimationLoaded."],
            ["SecureStore.getItemAsync('is_logged_in')", "Must be the string 'true'."],
            ["SecureStore.getItemAsync('ha_active_profile_id')", "Which HA profile to use."],
            ["SecureStore.getItemAsync('ha_profiles')", "JSON array of profiles (haUrl, haToken, adminUrl, name, userId)."],
            ["SecureStore.getItemAsync('logged_in_user')", "JSON { name, userId } passed as dashboard route params."],
            ["router.replace('/dashboard-v2')", "If all four keys are valid and the active profile exists."],
            ["router.replace('/login')", "Any missing key, parse error, or unknown profile id."],
        ],
        s,
        widths=[72 * mm, 102 * mm],
    ))
    story.append(callout(
        "<b>Login is skipped</b> when those four SecureStore keys are present. "
        "Face ID / password are not re-checked on a normal warm or cold start with a saved session.",
        s,
        AMBER,
    ))

    # ── Login ──────────────────────────────────────────────────────────────
    story.append(banner("4. If there is no session — login (app/login.jsx)", s))
    story.append(Paragraph("Only this path runs when splash sends the user to /login.", s["body"]))
    story.append(bullets([
        "<b>checkBiometrics()</b> — expo-local-authentication: hardware + enrolled Face ID / fingerprint.",
        "<b>loadSettings()</b> — reads ha_profiles, ha_active_profile_id, Face ID flags, saved biometric creds.",
        "Optional <b>scanNetwork()</b> (utils/discovery.js) if the user scans for Home Assistant.",
        "On submit: <b>validateCredentials()</b> (services/auth.js), <b>upsertAccountAndActivate()</b>, "
        "then <b>registerForPushNotificationsAsync()</b> again, then navigate to dashboard-v2.",
    ], s))

    # ── Phase 4 dashboard ──────────────────────────────────────────────────
    story.append(banner("5. Phase 4 — Dashboard boot (app/dashboard-v2.jsx)", s, PURPLE))
    story.append(Paragraph(
        "On first mount, dashboard-v2 starts several independent jobs. None of them wait for each other "
        "except the home-reveal gate in section 7.",
        s["body"],
    ))

    story.append(Paragraph("5.1 Local settings (SecureStore, parallel)", s["h2"]))
    story.append(table(
        ["Key", "State it fills"],
        [
            ["settings_show_family", "showFamily — person badges"],
            ["settings_auto_room_visit", "autoRoomVisit — open room from presence"],
            ["settings_auto_room_resume", "autoRoomResume — same on app resume"],
            ["settings_show_voice_assistant", "showVoiceAssistant — Butler mic in header"],
            ["settings_show_preference_button", "showPreferenceButton"],
            ["room_reorder_config", "savedRoomOrder — custom room card order"],
            ["ha_active_profile_id + ha_profiles", "connectionConfig { url, token, adminUrl, loaded }"],
        ],
        s,
        widths=[62 * mm, 112 * mm],
    ))
    story.append(Paragraph(
        "Functions: <font face='Courier'>loadConnectionConfig()</font>, "
        "<font face='Courier'>getButlerBackendUrl()</font> (resolves adminUrl + /api/butler, no network yet).",
        s["body"],
    ))

    story.append(Paragraph("5.2 Home Assistant WebSocket (HAService)", s["h2"]))
    story.append(Paragraph(
        "Once connectionConfig.loaded is true and haUrl + haToken exist: "
        "<font face='Courier'>new HAService(url, token)</font> → "
        "<font face='Courier'>connect()</font> → WebSocket to <font face='Courier'>/api/websocket</font>.",
        s["body"],
    ))
    story.append(table(
        ["HA command", "Function", "Result in app"],
        [
            ["auth (access_token)", "HAService.sendAuth()", "auth_ok → status CONNECTED; else AUTH_FAILED"],
            ["subscribe_events / state_changed", "handleMessage after auth_ok", "Live entity updates for the rest of the session"],
            ["get_states", "getStates()", "Full entity list (lights, climate, covers, locks, sensors, …)"],
            ["get_config", "getConfig()", "location_name → cityName in the header"],
            ["config/device_registry/list", "getDeviceRegistry()", "Devices → area mapping"],
            ["config/entity_registry/list", "getEntityRegistry()", "Entity → device / area / labels"],
            ["config/category_registry/list", "getCategoryRegistry()", "Categories"],
            ["config/area_registry/list", "getAreaRegistry()", "Rooms / areas for the home grid"],
            ["config/floor_registry/list", "getFloorRegistry()", "Floors; first floor selected by default"],
            ["config_entries/get", "getConfigEntries()", "Music Assistant entry_ids (failure ignored)"],
        ],
        s,
        widths=[52 * mm, 48 * mm, 74 * mm],
    ))
    story.append(Paragraph(
        "Those eight registry/state calls run in <b>one Promise.all</b> after auth_ok, then React state is set in a single batch. "
        "HAService also listens to AppState and reconnects (up to 5 times, exponential backoff) when returning to foreground.",
        s["body"],
    ))

    story.append(Paragraph("5.3 Admin backend APIs (AppBackendV1)", s["h2"]))
    story.append(Paragraph(
        "Fired from <font face='Courier'>fetchMappings()</font> and the same connection-config effect. "
        "All use Bearer HA token. Several endpoints are requested twice (mappings + initial-load effect); "
        "the later response wins.",
        s["body"],
    ))
    story.append(table(
        ["API", "Function / caller", "Used for"],
        [
            ["GET /api/config", "dashboard initial-load effect",
             "badgeConfig (selected areas, locks_armed, still-open reminder, …). Sets adminStatus OK/ERROR."],
            ["GET /api/quick-scenes", "fetchMappings()",
             "allowedQuickScenes (max 4 on home). Sets scenesFetched — part of reveal gate."],
            ["GET /api/monitored-entities?type=light", "fetchEnrichedLightMappings()",
             "Light mappings (type, dimmable/CCT/RGB)."],
            ["GET /api/light-types", "fetchEnrichedLightMappings()",
             "Icon type catalog; then preloadLocalLightIcons() again."],
            ["GET /api/monitored-entities?type=media_player", "fetchMappings()",
             "TV / Apple TV / media mappings."],
            ["GET /api/sensors", "fetchMappings() + initial-load",
             "Door / window / motion sensor types for badges and rooms."],
            ["GET /api/covers", "fetchMappings() + initial-load",
             "coverType, garageDuration, cover windows."],
            ["GET /api/climate-mappings", "fetchMappings()",
             "AC ↔ damper mappings."],
            ["GET /api/home-access", "fetchMappings()",
             "Which locks and garage/shutter covers appear on Home Access. Sets homeAccessFetched — reveal gate."],
            ["GET /api/lock-passage", "fetchMappings()",
             "Lock ↔ door-sensor pairs for passage mode."],
            ["GET /api/alerts", "initial-load effect",
             "Custom alert rules (kept in alertRulesRef for the socket handler)."],
            ["GET /api/entities", "initial-load effect",
             "Monitored vs ignored entities for in-app notifications."],
            ["GET /api/room-tracking/lookup", "initial-load effect",
             "ESPresense / tracker state → area_id for auto-open room."],
            ["GET /api/cameras", "initial-load effect",
             "HA camera fallback if Frigate config is empty."],
            ["GET /api/notifications/history", "useNotifications()",
             "Entity-history notification list."],
            ["GET /api/notifications/log", "useNotifications()",
             "Lock/garage push log from the backend."],
            ["POST /api/sessions/heartbeat", "startHeartbeat()",
             "Immediately, then every 30s. Device id, user, foreground/background."],
            ["POST /api/notifications/register", "registerForPushNotificationsAsync() (from layout)",
             "Expo push token + userId + device name."],
        ],
        s,
        widths=[58 * mm, 46 * mm, 70 * mm],
    ))

    story.append(Paragraph("5.4 Frigate cameras", s["h2"]))
    story.append(bullets([
        "<b>new FrigateService('', null, null, adminUrl, haToken)</b> — traffic is proxied through the admin backend, not a raw Frigate URL on the phone.",
        "<b>frigateService.getConfig()</b> — camera names/objects. Sets frigateCameras. Always sets frigateConfigResolved (success or fail).",
        "Home UI does <b>not</b> wait for Frigate. The camera strip fills in when this returns; the rest of home can already be visible.",
    ], s))

    story.append(Paragraph("5.5 Derived data after HA states arrive (no extra network)", s["h2"]))
    story.append(table(
        ["Computation", "Source"],
        [
            ["weather, humidity, indoorTemp", "First weather.* entity + humidity/temp sensors"],
            ["roomsWithCounts / dashboard rooms", "getSelectedAreasForDashboard, filterParentRoomsForDashboard, getRoomEntities"],
            ["Home Access locks &amp; garages", "selectedLockIds / selectedCoverIds + live entity states"],
            ["Status badges (lights / AC / doors)", "countActiveCountableLights, climate on, door sensors"],
            ["Security alert items", "Open locks / garage / shutters while alarm is armed"],
            ["Quick scene tiles", "allowedQuickScenes ∩ live entities"],
            ["useHaSystemHealth()", "Banner if HA/admin down; warnings delayed 10s"],
            ["Presence tracker entity", "Match userName in entity_id (*_room / *_location)"],
        ],
        s,
        widths=[58 * mm, 116 * mm],
    ))

    # ── Reveal ─────────────────────────────────────────────────────────────
    story.append(banner("6. Phase 5 — When the home screen actually appears", s))
    story.append(Paragraph(
        "Until the gate passes, dashboard-v2 shows <b>DashboardSkeleton</b> "
        "(header, scenes, home access, rooms, cameras placeholders).",
        s["body"],
    ))
    story.append(table(
        ["Condition", "Flag / data", "If missing"],
        [
            ["HA states loaded", "entities.length &gt; 0", "revealStep stays 0 (skeletons)"],
            ["Quick scenes API finished (ok or error)", "scenesFetched === true", "Wait — even an empty list counts as fetched"],
            ["Home Access API finished (ok or error)", "homeAccessFetched === true", "Wait"],
            ["User opened the app from a push", "alertNotif set", "Force revealStep = 5 immediately so the alert modal can show"],
        ],
        s,
        widths=[58 * mm, 52 * mm, 64 * mm],
    ))
    story.append(Paragraph(
        "Frigate, light mappings, media, covers, climate, heartbeat, and Butler are <b>not</b> on this gate. "
        "They populate as they arrive.",
        s["body"],
    ))

    # ── After first paint ──────────────────────────────────────────────────
    story.append(banner("7. After first paint (still during “load”, not on tap)", s))
    story.append(bullets([
        "<b>AppState listener</b> — on resume: re-run presence room, fetchMappings({ resetRevealCascade: false }), update heartbeat appState.",
        "<b>navigateToPresenceRoom()</b> — if autoRoomVisit is on and the user tracker reports a room, open that RoomSheet.",
        "<b>SecurityAlertModal</b> — if alarm is armed and a lock/garage/shutter is open.",
        "<b>NotificationModal / AlertNotificationModal</b> — pendingNotif from root layout.",
        "<b>Butler</b> is <i>not</i> connected at startup. Voice WebSocket + HA sync run only when the user taps the mic "
        "(canOpenButlerCall → runButlerBackgroundSetup → preflightButlerCall + POST /api/butler/admin/save).",
        "AI / Brain tab is not mounted until first visit (aiTabVisited).",
        "Room detail page (app/room.jsx) loads only when a room is opened; bootstrap is prepared by setRoomPageBootstrap().",
    ], s))

    # ── Assets ─────────────────────────────────────────────────────────────
    story.append(banner("8. Bundled assets loaded at startup", s))
    story.append(table(
        ["Asset", "When"],
        [
            ["Clash Display fonts (6 weights)", "Root layout — blocks first frame"],
            ["PrimeWave2.json (Lottie)", "Splash route"],
            ["shadow.png", "Root layout overlay (iOS only)"],
            ["Light type SVGs (6 files)", "preloadLocalLightIcons() on layout mount + again after light-types API"],
            ["app-icon.png / splash background #09091A", "Native Expo splash (app.json)"],
        ],
        s,
        widths=[70 * mm, 104 * mm],
    ))

    # ── Not loaded ─────────────────────────────────────────────────────────
    story.append(banner("9. Intentionally not loaded at startup", s, AMBER))
    story.append(bullets([
        "Butler Gemini Live WebSocket and microphone (until mic tap).",
        "Room page HA entities beyond the home registries (room screen has its own view).",
        "Frigate event history / clips (Cameras tab / modal on demand).",
        "Statistics, insights, automations, history screens.",
        "TV remote / Apple TV modal data until opened.",
        "Adaptive lighting switch details until the room lights card needs them.",
        "Full notification history refresh loop (one shot at mount via useNotifications).",
        "Re-authentication / Face ID when a session already exists.",
    ], s))

    # ── File map ───────────────────────────────────────────────────────────
    story.append(banner("10. Key files in the load path", s))
    story.append(table(
        ["File", "Role on startup"],
        [
            ["app/_layout.jsx", "Fonts, splash hide, push, orientation, NotifContext, stack"],
            ["app/index.jsx", "Lottie splash + session gate"],
            ["app/login.jsx", "Only if no session"],
            ["app/dashboard-v2.jsx", "Main boot: HA + admin + Frigate + UI reveal"],
            ["services/ha.js", "WebSocket client (auth, subscribe, get_states, registries)"],
            ["services/frigate.js", "Frigate config via admin proxy"],
            ["services/notifications.js", "Push token + backend register"],
            ["services/heartbeat.js", "POST /api/sessions/heartbeat every 30s"],
            ["hooks/useNotifications.js", "GET history + log"],
            ["hooks/useHaSystemHealth.js", "Connection banner (10s debounce)"],
            ["hooks/useDeviceType.js", "Phone vs tablet layout"],
            ["utils/lightMappingsClient.js", "Lights + types + icon inference"],
            ["utils/lightTypeAssets.js", "SVG icon preload"],
            ["utils/butlerBackend.js", "Resolve Butler URL (no socket yet)"],
            ["utils/roomHelpers.js / roomAreas.js", "Build room cards from registries"],
        ],
        s,
        widths=[52 * mm, 122 * mm],
    ))

    story.append(Spacer(1, 6 * mm))
    story.append(callout(
        "<b>Practical takeaway:</b> a logged-in cold start is bound by (1) font load, "
        "(2) 2.2s splash minimum, (3) HA WebSocket auth + get_states/registries, and "
        "(4) /api/quick-scenes + /api/home-access. Everything else (cameras, mappings, "
        "heartbeat, push, Butler) is background and must not block the first home paint.",
        s,
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="AppV1 — What loads when the app starts",
        author="Primewave",
    )
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
