# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A Tauri v2 desktop app: the React UI runs in a webview inside a Windows desktop window, which defaults to 1280×820 and can't be smaller than 1024×680. Its design language is web/MUI, not native Windows controls.)

## Users

Uptime Sentry serves three groups, with no single primary user:

- **Homelab users and self-hosters** watching their own router, NAS, home servers and a handful of sites.
- **IT admins and small-business operators** who are responsible for company services and devices and sometimes need to hand SLA reports to other people.
- **Developers** keeping an eye on their deployed services and their local or staging environments (for example a "Standard" profile and a "Dev" profile).

The job they share: *"Watch my things quietly, tell me the moment something goes down or comes back, and help me understand or fix it."* The app mostly runs minimized in the system tray. People open the window when an alert fires, when they add or change targets, or when they review history and reports.

## Product Purpose

Uptime Sentry automatically checks whether web services and local network devices are reachable and how fast they respond, so nobody has to check by hand in a browser. Success means outages are noticed right away (tray notification, sound, optional email), the cause and history are easy to look up afterwards, and simple failures can fix themselves through automated actions.

## Positioning

Four traits, taken together, set it apart from hosted or server-based monitors such as UptimeRobot, Uptime Kuma or PRTG:

1. **A local desktop app with no server.** It installs like a normal Windows program, with the Java runtime bundled. There is no Docker, hosting, account or cloud.
2. **It monitors the LAN from the user's own machine,** so it can reach private devices (routers, NAS drives, personal servers) that cloud monitors can't see.
3. **It acts on failure, not just alerts.** It can run shell commands, batch files or PowerShell scripts when a target goes down, for example to restart a service.
4. **It is lightweight and quiet.** It lives in the tray, needs little setup and ships with sensible defaults. Alerts come as tray notifications and sounds.

Future work should strengthen these traits, not drift toward a hosted or enterprise monitoring console.

## Operating Context

- Normally runs minimized in the Windows system tray. It can start automatically with Windows.
- The desktop shell starts an embedded Java REST API (Javalin, port 8765). The UI talks to it through `desktop/src/api/client.ts`.
- A console menu (`java -jar uptimesentry.jar`) and an API-only mode (`--api`) also exist for running without the desktop shell.
- Interactions happen in short bursts: an alert arrives → open the window → see what is down and since when → check history or charts → maybe trigger a fix or adjust a target.
- First run goes through an onboarding modal that sets autostart, the default check interval, log retention and default up/down sounds.
- Distributed as an Inno Setup installer (`UptimeSentry_Setup_v[version].exe`) via GitHub Releases.

## Capabilities and Constraints

- **Check methods:** ICMP ping and HTTP requests (with status-code analysis), with configurable timeouts and check intervals.
- **Profiles:** separate monitoring environments that can be created, edited and switched. Inactive profiles can optionally keep checking in the background.
- **Targets:** URLs or IP addresses, validated live while being set up.
- **Alerts:** tray notifications, up and down sounds (a default per profile, with custom WAV files allowed per target), and outage reports forwarded by email.
- **Automated actions:** shell commands, PowerShell scripts or batch files run when a target fails.
- **Analytics:** response-time charts, average latency and incident history with post-mortem logs.
- **Reports:** SLA reports for whole profiles or single targets, exported as PDF, Markdown or plain text.
- **Settings:** autostart, log retention limits and notification behavior.
- **Stack:** Java 21 backend (Javalin, Jackson); React 19, Vite, TypeScript and Material UI (MUI v9, including MUI X charts, data grid and date pickers) frontend; Tauri v2 (Rust) shell.
- **Terminology in use:** *Profile*, *Target*, *Check*, *Up* / *Down*, *Incident*, *SLA report*, *Auto-check*.
- **Current state, not a binding commitment:** Windows is the only platform targeted today (tray, autostart, PowerShell). Whether to stay on MUI for future UI work is undecided.
- **Template leftovers:** the UI started from the MUI dashboard template. Some unused template components remain (`ChartUserByCountry`, `PageViewsBarChart`, `CustomizedTreeView`, `HighlightedCard`, `internals/data/gridData.ts`). Treat them as scaffolding, not product features.

## Brand Commitments

- Name: **Uptime Sentry**. The product name is written with a space; code and package identifiers use `UptimeSentry` / `uptime-sentry`.
- Existing assets: the app icon set in `desktop/src-tauri/icons/`, tray icons (`src/main/resources/icons/tray-16.png`, `tray-32.png`) and a library of bundled up and down notification sounds (`src/main/resources/audio/notification/`).
- It is a free, open-source hobby project by wladermisch (github.com/wladermisch/Uptime-Sentry).

## Evidence on Hand

- README feature list and install instructions (`README.md`).
- The working desktop app, Java backend and bundled sound library.
- **Absent, and never to be invented:** pricing, paid tiers, customers, user counts, testimonials, benchmarks, press, or any commercial or enterprise claims. The project is free and open source and has none of these.

## Product Principles

1. **Quiet until it matters.** The default state is calm and out of the way. Attention is spent only on real changes in state (down, recovered).
2. **Status at a glance.** When the window opens, what is down, since when and how badly should be clear in seconds.
3. **Local and self-contained.** No accounts, servers or cloud dependencies. The user's machine is the monitor.
4. **From alert to action.** Make it short to get from noticing a failure to understanding it or fixing it (history, logs, automated actions).
5. **Honest hobby-scale software.** Present real capabilities plainly. Never imply commercial scale or proof that doesn't exist.
