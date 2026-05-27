from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import re

# ── Colour palette ───────────────────────────────────────────────
BRAND   = colors.HexColor("#1a1a2e")   # dark navy — headings / header bar
ACCENT  = colors.HexColor("#e94560")   # red-pink — rule lines, table header
LIGHT   = colors.HexColor("#f5f5f5")   # very light grey — table alt rows
WHITE   = colors.white
MID     = colors.HexColor("#555555")   # body text
SOFT    = colors.HexColor("#888888")   # captions / sub-labels

# ── Document ─────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    "PRODUCTION_TIMELINE.pdf",
    pagesize=A4,
    leftMargin=2.2*cm, rightMargin=2.2*cm,
    topMargin=2.2*cm,  bottomMargin=2.2*cm,
)

W = A4[0] - 4.4*cm   # usable width

# ── Styles ───────────────────────────────────────────────────────
base = getSampleStyleSheet()

def S(name, parent="Normal", **kw):
    return ParagraphStyle(name, parent=base[parent], **kw)

sTitle   = S("sTitle",   fontSize=26, leading=32, textColor=WHITE,
             fontName="Helvetica-Bold", alignment=TA_CENTER)
sSub     = S("sSub",     fontSize=11, leading=16, textColor=colors.HexColor("#dddddd"),
             fontName="Helvetica", alignment=TA_CENTER)
sDate    = S("sDate",    fontSize=9,  leading=12, textColor=colors.HexColor("#aaaaaa"),
             fontName="Helvetica", alignment=TA_CENTER)

sH1      = S("sH1",      fontSize=14, leading=20, textColor=BRAND,
             fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=4)
sH2      = S("sH2",      fontSize=11, leading=16, textColor=BRAND,
             fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=3)
sH3      = S("sH3",      fontSize=10, leading=14, textColor=ACCENT,
             fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=2)

sBody    = S("sBody",    fontSize=9.5, leading=14, textColor=MID,
             fontName="Helvetica", spaceAfter=4)
sBullet  = S("sBullet",  fontSize=9.5, leading=14, textColor=MID,
             fontName="Helvetica", leftIndent=14, spaceAfter=2,
             bulletIndent=4)
sNote    = S("sNote",    fontSize=8.5, leading=13, textColor=SOFT,
             fontName="Helvetica-Oblique", leftIndent=14, spaceAfter=3)
sTHdr    = S("sTHdr",    fontSize=9,  leading=12, textColor=WHITE,
             fontName="Helvetica-Bold")
sTCell   = S("sTCell",   fontSize=9,  leading=13, textColor=MID,
             fontName="Helvetica")
sTCellB  = S("sTCellB",  fontSize=9,  leading=13, textColor=MID,
             fontName="Helvetica-Bold")

# ── Table helper ─────────────────────────────────────────────────
def make_table(headers, rows, col_widths):
    hdr_row = [Paragraph(h, sTHdr) for h in headers]
    data = [hdr_row]
    for i, row in enumerate(rows):
        cells = []
        for j, cell in enumerate(row):
            style = sTCellB if j == 0 else sTCell
            cells.append(Paragraph(cell, style))
        data.append(cells)

    alt = colors.HexColor("#f0f0f8")
    ts = TableStyle([
        # header
        ("BACKGROUND",  (0,0), (-1,0), ACCENT),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, alt]),
        ("GRID",        (0,0), (-1,-1), 0.4, colors.HexColor("#cccccc")),
        ("TOPPADDING",  (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING",(0,0), (-1,-1), 7),
        ("VALIGN",      (0,0), (-1,-1), "TOP"),
    ])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(ts)
    return t

def rule():
    return HRFlowable(width="100%", thickness=1, color=ACCENT, spaceAfter=6, spaceBefore=2)

def spacer(h=0.3):
    return Spacer(1, h*cm)

# ── Header banner ────────────────────────────────────────────────
banner_data = [[
    Paragraph("Wardrope", sTitle),
    Paragraph("Production Readiness Timeline", sSub),
    Paragraph("Prepared: May 26, 2026  ·  Current build: wardrope-red.vercel.app", sDate),
]]
banner = Table(banner_data, colWidths=[W])
banner.setStyle(TableStyle([
    ("BACKGROUND",   (0,0), (-1,-1), BRAND),
    ("TOPPADDING",   (0,0), (-1,-1), 18),
    ("BOTTOMPADDING",(0,0), (-1,-1), 18),
    ("LEFTPADDING",  (0,0), (-1,-1), 16),
    ("RIGHTPADDING", (0,0), (-1,-1), 16),
    ("ROWSPAN",      (0,0), (-1,-1), 3),
]))

story = [banner, spacer(0.5)]

# ── Section 1: What is Already Built ─────────────────────────────
story += [
    Paragraph("What Is Already Built and Live", sH1),
    rule(),
    spacer(0.15),
    make_table(
        ["Area", "Status"],
        [
            ["Frontend (web app)", "Live — all screens built and deployed"],
            ["Backend API (FastAPI)", "Live — deployed and connected to database"],
            ["Database (MongoDB Atlas)", "Live — user data persisting"],
            ["Email / password auth", "Working"],
            ["Google sign-in", "Built — needs end-to-end test"],
            ["Digital wardrobe (add, view, delete items)", "Built"],
            ["AI clothing tagger (auto-labels photos)", "Built — needs API key to activate"],
            ["AI stylist (generates outfits from wardrobe)", "Built — needs API key to activate"],
            ["Lookbooks (editorial inspo + recreate with items)", "Built"],
            ["Camera roll bulk scan", "Built"],
            ["Outfit saving and favourites", "Built"],
            ["User onboarding flow", "Built"],
        ],
        [W*0.52, W*0.48],
    ),
    spacer(0.4),
]

# ── Section 2: Phase 1 ───────────────────────────────────────────
story += [
    Paragraph("What Is Still Needed Before Production", sH1),
    rule(),
    spacer(0.1),
    Paragraph("Phase 1 — Make It Fully Functional  (1–2 weeks)", sH2),
    Paragraph(
        "These are blockers. The app is live but key features are inactive until these are resolved.",
        sBody,
    ),
    spacer(0.1),
    make_table(
        ["Task", "Effort", "Why It Matters"],
        [
            ["Add OpenAI API key to backend", "1 hour",
             "Without it, AI tagging and the stylist return nothing — the app's core differentiators."],
            ["Set a real JWT secret", "1 hour",
             "Currently using a default dev value. Must be changed before real users sign in."],
            ["Test Google sign-in end to end", "1 day",
             "The flow is built but depends on a third-party OAuth proxy. Needs a verified pass on real devices."],
            ["Full QA pass on all screens", "3–4 days",
             "Click through every screen on web (desktop + mobile browser) and log any broken flows."],
        ],
        [W*0.38, W*0.14, W*0.48],
    ),
    spacer(0.15),
    Paragraph(
        "End of Phase 1: The app is feature-complete and usable by real users for a private beta.",
        sNote,
    ),
    spacer(0.3),
]

# ── Section 3: Phase 2 ───────────────────────────────────────────
story += [
    Paragraph("Phase 2 — Production Hardening  (2–3 weeks)", sH2),
    Paragraph(
        "The app works but is not safe or scalable at volume.",
        sBody,
    ),
    spacer(0.1),
    make_table(
        ["Task", "Effort", "Why It Matters"],
        [
            ["Migrate image storage off MongoDB", "4–5 days",
             "Images stored as base64 inside DB records. MongoDB has a 16 MB doc limit — a user with 50+ items will hit errors. Need Cloudinary or S3."],
            ["Forgot password / password reset", "2–3 days",
             "No way for users to recover their account. Requires email sending (SendGrid or similar)."],
            ["Rate limiting on the API", "1 day",
             "Without it, anyone can hammer AI endpoints and run up OpenAI costs."],
            ["Error monitoring (Sentry)", "1 day",
             "Errors are invisible unless logs are checked manually. Need alerts when things break."],
            ["Brand recognition ('Identified' mode)", "3–5 days",
             "App has a toggle for identifying exact brand/product of an item, but it currently returns nothing. Requires Ximilar or Google Lens integration."],
        ],
        [W*0.38, W*0.14, W*0.48],
    ),
    spacer(0.15),
    Paragraph(
        "End of Phase 2: The app is production-safe for a public launch on web.",
        sNote,
    ),
    spacer(0.3),
]

# ── Section 4: Phase 3 ───────────────────────────────────────────
story += [
    Paragraph("Phase 3 — Native Mobile App  (4–6 weeks, if required)", sH2),
    Paragraph(
        "If the client wants an iOS/Android app in the App Store, this is a separate workstream. "
        "The codebase is already built in React Native (Expo), so no rewrite is needed — this is "
        "configuration and platform compliance work only.",
        sBody,
    ),
    spacer(0.1),
    make_table(
        ["Task", "Effort"],
        [
            ["Set up Expo EAS Build (cloud build pipeline)", "2–3 days"],
            ["iOS-specific fixes (camera permissions, image picker)", "3–5 days"],
            ["Android-specific fixes", "2–3 days"],
            ["Apple Developer account + App Store submission", "1–2 weeks (Apple review)"],
            ["Google Play account + submission", "3–5 days (faster review)"],
            ["Push notifications (outfit reminders, new lookbooks)", "3–4 days"],
        ],
        [W*0.62, W*0.38],
    ),
    spacer(0.4),
]

# ── Section 5: Summary Timeline ──────────────────────────────────
story += [
    Paragraph("Summary Timeline", sH1),
    rule(),
    spacer(0.1),
    make_table(
        ["Milestone", "Target"],
        [
            ["AI features active, auth confirmed working", "Week 1–2"],
            ["Private beta launch (invite only)", "Week 2"],
            ["Image storage fixed, password reset, rate limiting", "Week 3–4"],
            ["Public web launch", "Week 4–5"],
            ["Native iOS + Android apps submitted", "Week 8–10"],
            ["App Store / Play Store approval", "Week 9–12"],
        ],
        [W*0.70, W*0.30],
    ),
    spacer(0.4),
]

# ── Section 6: Key Risks ─────────────────────────────────────────
story += [
    Paragraph("Key Risks", sH1),
    rule(),
    spacer(0.1),
    Paragraph(
        "1.  <b>Apple App Store review</b> — Apple typically takes 1–3 weeks and may reject "
        "the first submission. Budget 2 review cycles into the schedule.",
        sBullet,
    ),
    Paragraph(
        "2.  <b>OpenAI API costs</b> — The AI stylist and tagger call GPT-4o per user request. "
        "With an active user base, costs can grow quickly. A per-user daily usage cap should be "
        "built into Phase 2.",
        sBullet,
    ),
    Paragraph(
        "3.  <b>Google OAuth dependency</b> — Google sign-in currently routes through a "
        "third-party proxy. If that service changes, Google login breaks. Replacing it with a "
        "direct OAuth integration is recommended before a large public launch.",
        sBullet,
    ),
    spacer(0.4),
]

# ── Section 7: Out of Scope ──────────────────────────────────────
story += [
    Paragraph("Not in Scope (Not Built, Not Planned)", sH1),
    rule(),
    spacer(0.1),
    Paragraph(
        "The following are <b>not</b> part of the current codebase and would require a separate "
        "scoping conversation if the client wants them:",
        sBody,
    ),
]
oos = [
    "Shopping / e-commerce integration (buy the identified item)",
    "Social features (share outfits, follow other users)",
    "Weather API integration for automatic outfit suggestions",
    "Subscription / paywall / in-app purchases",
    "Multi-language support",
]
for item in oos:
    story.append(Paragraph(f"•  {item}", sBullet))

story.append(spacer(0.5))
story.append(
    Paragraph(
        "These can be scoped as a follow-on phase once the core app is stable.",
        sNote,
    )
)

# ── Build ─────────────────────────────────────────────────────────
doc.build(story)
print("PDF written: PRODUCTION_TIMELINE.pdf")
