from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "bobby-agent-trader-one-page-summary.pdf"


def bullet_list(items, style, bullet_color="#1f7a4c", left_indent=10):
    return ListFlowable(
        [ListItem(Paragraph(item, style)) for item in items],
        bulletType="bullet",
        start="circle",
        bulletColor=colors.HexColor(bullet_color),
        leftIndent=left_indent,
        bulletFontName="Helvetica",
        bulletFontSize=7,
    )


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    page_width, page_height = landscape(letter)
    margin = 0.42 * inch

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=(page_width, page_height),
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleBar",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=20,
            textColor=colors.HexColor("#0c1110"),
            alignment=TA_LEFT,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=colors.HexColor("#0f3d2e"),
            spaceAfter=4,
            spaceBefore=0,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCompact",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.7,
            leading=9.0,
            textColor=colors.HexColor("#18201d"),
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCompact",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=8.8,
            textColor=colors.HexColor("#18201d"),
            leftIndent=0,
            spaceAfter=1,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallNote",
            parent=styles["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=6.5,
            leading=7.6,
            textColor=colors.HexColor("#47544e"),
        )
    )

    title = Paragraph("Bobby Agent Trader - One-Page App Summary", styles["TitleBar"])
    subtitle = Paragraph(
        "Repo-based summary for the Vite + React + TypeScript app in this workspace",
        styles["SmallNote"],
    )

    left_story = [
        Paragraph("What It Is", styles["Section"]),
        Paragraph(
            "Bobby Agent Trader is a trading intelligence experience inside the DeFi Mexico Hub codebase: a terminal-style web app backed by Vercel serverless APIs, Supabase persistence, and OKX/X Layer integrations. Repo evidence shows a multi-agent debate product centered on Bobby pages, forum threads, signals, analytics, and execution-related services.",
            styles["BodyCompact"],
        ),
        Paragraph("Who It's For", styles["Section"]),
        Paragraph(
            "Primary persona: an active crypto trader who wants fast market context, debate-style trade analysis, and optional wallet or Telegram-connected workflows. Secondary audience visible in repo: external agents/apps consuming Bobby endpoints and MCP-style commerce endpoints.",
            styles["BodyCompact"],
        ),
        Paragraph("What It Does", styles["Section"]),
        bullet_list(
            [
                "Runs a terminal-like trading room UI via <b>AdamsChat</b> inside the Bobby shell.",
                "Shows live market context such as tickers, charts, conviction, signals, and execution timeline components.",
                "Generates fast market intelligence through <b>/api/bobby-intel</b> and fuller autonomous cycles through <b>/api/bobby-cycle</b> and <b>/api/agent-run</b>.",
                "Publishes debate artifacts and history into forum data structures used by the forum, analytics, history, and metacognition pages.",
                "Supports explain/analyze flows via AI-backed serverless endpoints including <b>/api/explain</b>.",
                "Integrates wallet-aware flows and trading components for swaps/perps on OKX/X Layer related paths.",
                "Extends into Telegram with webhook handling, activation checks, text replies, and voice-note delivery.",
            ],
            styles["BulletCompact"],
        ),
    ]

    right_story = [
        Paragraph("How It Works", styles["Section"]),
        Paragraph(
            "<b>Frontend:</b> React 18 + Vite app with lazy-loaded routes in <b>src/App.tsx</b>; Bobby pages are wrapped by <b>KineticShell</b>, which provides nav, ticker tape, and terminal styling.",
            styles["BodyCompact"],
        ),
        Paragraph(
            "<b>User surface:</b> <b>src/pages/BobbyAgentTraderPage.tsx</b> mounts <b>AdamsChat</b> as the primary terminal experience, plus proactive notifications and wallet context from wagmi/Reown.",
            styles["BodyCompact"],
        ),
        Paragraph(
            "<b>APIs:</b> Vercel functions under <b>api/</b> provide intelligence, debate/cycle orchestration, explainers, market data proxies, Telegram bot behavior, and other Bobby services.",
            styles["BodyCompact"],
        ),
        Paragraph(
            "<b>Persistence:</b> Supabase clients appear in both frontend and backend code; forum threads/posts and Telegram group or subscription records are read/written through Supabase REST or SDK calls.",
            styles["BodyCompact"],
        ),
        Paragraph(
            "<b>External services:</b> repo evidence shows use of OpenAI and Anthropic APIs, OKX market/DEX endpoints, Telegram Bot API, and X Layer-oriented trading/payment flows.",
            styles["BodyCompact"],
        ),
        Paragraph(
            "<b>Compact data flow:</b> user opens Bobby UI or Telegram -> frontend/serverless requests Bobby endpoints -> endpoints gather market/context data and model output -> results persist to Supabase/forum records -> UI/forum/Telegram read back those artifacts.",
            styles["BodyCompact"],
        ),
        Paragraph("How To Run", styles["Section"]),
        bullet_list(
            [
                "Install dependencies: <b>npm install</b>.",
                "Start local dev server: <b>npm run dev</b>.",
                "Open the Vite URL shown in the terminal.",
                "Before pushing/deploying, build production output: <b>npm run build</b>.",
                "Environment setup details for required keys/secrets: <b>Not found in repo</b>.",
            ],
            styles["BulletCompact"],
        ),
        Spacer(1, 5),
        Paragraph(
            "Evidence basis: README.md, package.json, src/App.tsx, src/pages/BobbyAgentTraderPage.tsx, src/components/kinetic/KineticShell.tsx, src/components/adams/AdamsChat.tsx, api/agent-run.ts, api/bobby-cycle.ts, api/bobby-intel.ts, api/explain.ts, api/telegram-webhook.ts, src/lib/supabase.ts.",
            styles["SmallNote"],
        ),
    ]

    header_table = Table(
        [[title], [subtitle]],
        colWidths=[page_width - (2 * margin)],
    )
    header_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dff5e8")),
                ("BOX", (0, 0), (-1, 0), 0.75, colors.HexColor("#7cc89c")),
                ("BOX", (0, 1), (-1, 1), 0.5, colors.HexColor("#c6ddd0")),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f6fbf8")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    body_table = Table(
        [[left_story, right_story]],
        colWidths=[(page_width - (2 * margin)) * 0.49, (page_width - (2 * margin)) * 0.51],
        hAlign="LEFT",
    )
    body_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBEFORE", (1, 0), (1, 0), 0.6, colors.HexColor("#c9d7cf")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#c9d7cf")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbfdfb")),
            ]
        )
    )

    doc.build([header_table, Spacer(1, 8), body_table])


if __name__ == "__main__":
    build_pdf()
