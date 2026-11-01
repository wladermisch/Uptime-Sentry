---
version: 1
slug: "desktop-src-dashboard-components-maingrid-tsx"
primary_target: "desktop/src/dashboard/components/MainGrid.tsx"
related_targets: ["desktop/src/dashboard/Dashboard.tsx","desktop/src/shared-theme/themePrimitives.ts","desktop/src/dashboard/home/GateBoard.tsx","desktop/src/dashboard/home/TargetPass.tsx"]
---

# Home (status board)

Scope: the Home screen of the desktop app, plus the shared shell (side rail, top bar) and theme every other screen inherits. Mode: **Operate**.

Audience and job: homelab users, IT admins and developers who open the window after a tray alert. They need to see what is down and since when, then check it, run its recovery action or look at its history. Healthy targets recede.

Constraints: keep light and dark mode; remove the unused MUI template leftovers; MUI stays as the component base (standard controls); no feature removed. Only Up/Down states exist per target; "changed" means a state change the user hasn't acknowledged yet.

Unresolved: the other screens (Profiles, Targets, Analytics, Reports, Settings, About, Feedback, onboarding) inherit the theme now and get rebuilt in follow-up passes.

## Direction contract

THESIS: Home is a live gate board. Targets are ranked in place by severity, and any change of state stays lit until it has been seen. It refuses the category default of KPI cards over a decorative latency chart.

OWN-WORLD: Matte neutral panels on one stepped ramp (ink #0B0D10, slate #16181C/#1C2127, steel #6B7178, panel #E6E8EB, surface #FFFFFF). Dark mode puts the board on ink; light mode puts it on panel and surface. Red #D7261E means down and only down; orange #FF5A1F means "changed, not yet acknowledged" and only that. Archivo carries names and headings. JetBrains Mono carries every figure, host and time, all tabular. Labels are tracked uppercase in mono. Hairline rules; nothing is padded into cards.

STORY: The user opens the window and sees down targets ranked first, each with the time it went down and how long ago. Recovered targets sit lit in orange until acknowledged. The user selects a row and gets its pass, then checks it, runs its action, or acknowledges it.

FIRST VIEWPORT: A narrow icon rail on the left. A top bar with the page title, profile switcher, notifications and colour mode. Under it, the board strip: the verdict as a condensed heading ("2 targets are down"), last check time, next-check countdown with pause/resume, down/recovered/up/pending counts and the filter, with "Acknowledge all" and the primary "Check all now" at its right (moved from the top bar so board-wide actions sit with the board they act on). The ranked board fills the centre: #, Target, Host, Status, Since, Latency, where the rank cell is a filled red block on down rows and a filled orange block on unacknowledged recoveries, and down rows carry a faint red tint (no coloured edge stripes). A 400px pass panel on the right shows the selected target in segments: name and host; down since, duration, failures and timeout; last message; recovery action (it runs automatically; the backend has no manual trigger), then Check now, Acknowledge, View history and Edit target.

FORM: Gate Board & Pass, a dealt challenger chosen over my list (catalog vernacular-ephemera-boarding-pass-and-gate-board); seed:8b318695f2976666. Signature interaction: a row re-ranks in place with its identity kept (FLIP motion) when its state changes, and stays lit orange until acknowledged. Motion grammar: short 180–240ms ease-out moves, nothing decorative, all disabled under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
