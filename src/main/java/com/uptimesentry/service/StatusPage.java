package com.uptimesentry.service;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.uptimesentry.model.CheckResult;
import com.uptimesentry.model.MaintenanceWindow;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.persistence.AppData;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.SettingsRepository.AppSettings;
import com.uptimesentry.util.SentryLogger;

import io.javalin.Javalin;

/**
 * A read-only status page: current state, 30 days of daily availability, maintenance and recent
 * outages. Served on the API's own port for this computer, and, when switched on, on a separate
 * port for the local network that serves nothing but this page.
 */
public class StatusPage {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.ENGLISH);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final long CACHE_MS = 20_000;

    private final List<MonitoredTarget> targets;
    private Javalin networkServer;
    private int networkPort;
    private String networkError;
    private Snapshot cached;
    private long cachedAt;

    public StatusPage(List<MonitoredTarget> targets) {
        this.targets = targets;
    }

    record TargetStatus(MonitoredTarget target, String state, String message, Long latency, String lastChecked,
                        Double day, Double week, Double month, List<Double> daily, List<Boolean> dailyMaintenance) {
    }

    record Snapshot(List<TargetStatus> rows, List<MaintenanceWindow> active, List<Object[]> upcoming,
                    List<Object[]> outages, LocalDateTime at) {
    }

    // ── Network server ──────────────────────────────────────────────────────

    /** Starts, restarts or stops the network server to match the settings. */
    public synchronized void applySettings() {
        AppSettings s = SettingsRepository.loadSettings();
        boolean want = s.statusPageEnabled && s.statusPageNetwork;
        int port = Math.max(1024, Math.min(65535, s.statusPagePort));
        if (networkServer != null && (!want || port != networkPort)) {
            networkServer.stop();
            networkServer = null;
            SentryLogger.info("Status page network server stopped.");
        }
        networkError = null;
        if (!want || networkServer != null) return;
        if (port == 8765) {
            networkError = "Port 8765 is used by the app itself. Pick another port.";
            return;
        }
        try {
            Javalin app = Javalin.create(config -> config.showJavalinBanner = false);
            app.get("/", ctx -> ctx.html(html()));
            app.get("/status.json", ctx -> ctx.json(json()));
            app.start("0.0.0.0", port);
            networkServer = app;
            networkPort = port;
            SentryLogger.info("Status page shared on the network at port " + port + ".");
        } catch (Exception e) {
            networkError = "Couldn't open port " + port + ": " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            SentryLogger.error("Status page network server: " + networkError);
        }
    }

    /** Where the page can be opened, for the settings screen. */
    public synchronized Map<String, Object> info() {
        AppSettings s = SettingsRepository.loadSettings();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("enabled", s.statusPageEnabled);
        m.put("localUrl", "http://127.0.0.1:8765/status");
        List<String> urls = new ArrayList<>();
        if (networkServer != null) {
            for (String ip : lanAddresses()) urls.add("http://" + ip + ":" + networkPort + "/");
        }
        m.put("networkUrls", urls);
        m.put("networkRunning", networkServer != null);
        m.put("networkError", networkError);
        return m;
    }

    static List<String> lanAddresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLinkLocalAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception e) {
            // No addresses to show.
        }
        return out;
    }

    // ── Data ────────────────────────────────────────────────────────────────

    private synchronized Snapshot snapshot() {
        long nowMs = System.currentTimeMillis();
        if (cached != null && nowMs - cachedAt < CACHE_MS) return cached;
        AppSettings s = SettingsRepository.loadSettings();
        LocalDateTime now = LocalDateTime.now();
        LocalDate today = now.toLocalDate();
        LocalDateTime monthStart = today.minusDays(29).atStartOfDay();

        List<MonitoredTarget> shown = new ArrayList<>();
        synchronized (targets) {
            for (MonitoredTarget t : targets) {
                List<String> ids = s.statusPageProfileIds;
                if (ids == null || ids.isEmpty() || ids.contains(t.getProfileId())) shown.add(t);
            }
        }
        Map<Integer, List<CheckResult>> byTarget = new LinkedHashMap<>();
        for (CheckResult c : HistoryRepository.query(monthStart.minusDays(1).format(UptimeStats.TS), null, null, 2_000_000)) {
            byTarget.computeIfAbsent(c.getTargetId(), k -> new ArrayList<>()).add(c);
        }

        List<TargetStatus> rows = new ArrayList<>();
        List<Object[]> outages = new ArrayList<>();
        for (MonitoredTarget t : shown) {
            List<CheckResult> checks = byTarget.getOrDefault(t.getId(), List.of());
            CheckResult latest = checks.isEmpty() ? null : checks.get(0); // Newest first.
            String state;
            if (t.isPaused()) state = "paused";
            else if (AppData.activeMaintenance(t, now) != null) state = "maintenance";
            else if (latest == null) state = "pending";
            else state = latest.isSuccess() ? "up" : "down";
            List<Double> daily = new ArrayList<>();
            List<Boolean> dailyMaint = new ArrayList<>();
            for (int i = 29; i >= 0; i--) {
                LocalDateTime from = today.minusDays(i).atStartOfDay();
                UptimeStats.Figures f = UptimeStats.compute(checks, from, from.plusDays(1), now);
                daily.add(f.availability());
                dailyMaint.add(f.checks() == 0 && f.maintenanceChecks() > 0);
            }
            UptimeStats.Figures month = UptimeStats.compute(checks, monthStart, now.plusSeconds(1), now);
            for (UptimeStats.Outage o : month.outages()) {
                if (o.start().isAfter(now.minusDays(7))) outages.add(new Object[] { t, o });
            }
            rows.add(new TargetStatus(t, state, latest == null ? "" : latest.getMessage(),
                latest != null && latest.isSuccess() && latest.getDurationMillis() >= 0 ? latest.getDurationMillis() : null,
                latest == null ? null : latest.getTimestamp(),
                UptimeStats.compute(checks, now.minusDays(1), now.plusSeconds(1), now).availability(),
                UptimeStats.compute(checks, now.minusDays(7), now.plusSeconds(1), now).availability(),
                month.availability(), daily, dailyMaint));
        }
        outages.sort((a, b) -> ((UptimeStats.Outage) b[1]).start().compareTo(((UptimeStats.Outage) a[1]).start()));
        if (outages.size() > 10) outages = new ArrayList<>(outages.subList(0, 10));

        List<MaintenanceWindow> active = new ArrayList<>();
        List<Object[]> upcoming = new ArrayList<>();
        for (MaintenanceWindow w : AppData.maintenance()) {
            if (shown.stream().noneMatch(w::covers)) continue;
            if (w.isActive(now)) active.add(w);
            LocalDateTime next = w.nextStart(now);
            if (next != null && next.isBefore(now.plusDays(7))) upcoming.add(new Object[] { w, next });
        }
        upcoming.sort((a, b) -> ((LocalDateTime) a[1]).compareTo((LocalDateTime) b[1]));
        cached = new Snapshot(rows, active, upcoming, outages, now);
        cachedAt = nowMs;
        return cached;
    }

    public Map<String, Object> json() {
        AppSettings s = SettingsRepository.loadSettings();
        Snapshot snap = snapshot();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", s.statusPageTitle);
        out.put("generated", snap.at().format(UptimeStats.TS));
        out.put("overall", overall(snap));
        List<Map<String, Object>> list = new ArrayList<>();
        for (TargetStatus r : snap.rows()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", r.target().getName());
            m.put("type", r.target().getType());
            if (s.statusPageShowHosts) m.put("host", r.target().getHost());
            m.put("profile", r.target().getProfileName());
            m.put("state", r.state());
            m.put("responseTimeMs", r.latency());
            m.put("lastChecked", r.lastChecked());
            m.put("uptime24h", r.day());
            m.put("uptime7d", r.week());
            m.put("uptime30d", r.month());
            m.put("daily", r.daily());
            list.add(m);
        }
        out.put("targets", list);
        return out;
    }

    private static String overall(Snapshot snap) {
        long down = snap.rows().stream().filter(r -> r.state().equals("down")).count();
        if (down > 0) return down == snap.rows().size() ? "major_outage" : "partial_outage";
        if (!snap.active().isEmpty()) return "maintenance";
        return "operational";
    }

    // ── Page ────────────────────────────────────────────────────────────────

    public String html() {
        AppSettings s = SettingsRepository.loadSettings();
        Snapshot snap = snapshot();
        String title = s.statusPageTitle == null || s.statusPageTitle.isBlank() ? "Service status" : s.statusPageTitle;
        long down = snap.rows().stream().filter(r -> r.state().equals("down")).count();
        String overall = overall(snap);
        String banner = switch (overall) {
            case "major_outage" -> "Major outage";
            case "partial_outage" -> down + (down == 1 ? " service is down" : " services are down");
            case "maintenance" -> "Maintenance in progress";
            default -> snap.rows().isEmpty() ? "Nothing is being monitored yet" : "All services operational";
        };

        StringBuilder h = new StringBuilder();
        h.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
            .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            .append("<meta http-equiv=\"refresh\" content=\"60\">")
            .append("<title>").append(esc(title)).append("</title><style>").append(CSS).append("</style></head><body><main>");
        h.append("<header><div class=\"eyebrow\">Status</div><h1>").append(esc(title)).append("</h1></header>");
        h.append("<section class=\"banner ").append(overall).append("\"><span class=\"dot\"></span>").append(esc(banner))
            .append("<span class=\"at\">Updated ").append(esc(WHEN.format(snap.at()))).append("</span></section>");

        for (MaintenanceWindow w : snap.active()) {
            h.append("<section class=\"notice\"><b>Maintenance: ").append(esc(blank(w.title, "Planned work"))).append("</b>");
            if (w.note != null && !w.note.isBlank()) h.append("<p>").append(esc(w.note)).append("</p>");
            h.append("</section>");
        }

        String group = null;
        h.append("<section class=\"list\">");
        for (TargetStatus r : snap.rows()) {
            String g = blank(r.target().getProfileName(), "");
            if (!g.equals(group) && snap.rows().stream().map(x -> blank(x.target().getProfileName(), "")).distinct().count() > 1) {
                h.append("<h2>").append(esc(g)).append("</h2>");
            }
            group = g;
            h.append("<article><div class=\"row\"><div class=\"name\"><b>").append(esc(r.target().getName())).append("</b>");
            if (s.statusPageShowHosts) h.append("<span class=\"host\">").append(esc(r.target().getHost())).append("</span>");
            h.append("</div><span class=\"state ").append(r.state()).append("\">").append(stateLabel(r.state())).append("</span></div>");
            h.append("<div class=\"bars\" aria-label=\"Daily availability, last 30 days\">");
            for (int i = 0; i < r.daily().size(); i++) {
                Double a = r.daily().get(i);
                String cls = Boolean.TRUE.equals(r.dailyMaintenance().get(i)) ? "m" : a == null ? "n" : a >= 99.95 ? "g" : a >= 99 ? "w" : "b";
                LocalDate day = snap.at().toLocalDate().minusDays(r.daily().size() - 1L - i);
                String tip = DAY.format(day) + ": " + (cls.equals("m") ? "maintenance" : UptimeStats.pct(a));
                h.append("<i class=\"").append(cls).append("\" title=\"").append(esc(tip)).append("\"></i>");
            }
            h.append("</div><div class=\"meta\"><span>30 days ago</span><span>")
                .append("24 h ").append(UptimeStats.pct(r.day())).append(" · 7 d ").append(UptimeStats.pct(r.week()))
                .append(" · 30 d ").append(UptimeStats.pct(r.month()))
                .append(r.latency() != null ? " · " + r.latency() + " ms" : "")
                .append("</span><span>Today</span></div></article>");
        }
        h.append("</section>");

        if (!snap.upcoming().isEmpty()) {
            h.append("<section class=\"side\"><h2>Planned maintenance</h2>");
            for (Object[] u : snap.upcoming()) {
                MaintenanceWindow w = (MaintenanceWindow) u[0];
                h.append("<p><b>").append(esc(WHEN.format((LocalDateTime) u[1]))).append("</b> · ").append(esc(blank(w.title, "Planned work"))).append("</p>");
            }
            h.append("</section>");
        }
        h.append("<section class=\"side\"><h2>Outages in the last 7 days</h2>");
        if (snap.outages().isEmpty()) h.append("<p class=\"muted\">None.</p>");
        for (Object[] o : snap.outages()) {
            MonitoredTarget t = (MonitoredTarget) o[0];
            UptimeStats.Outage out = (UptimeStats.Outage) o[1];
            h.append("<p><b>").append(esc(t.getName())).append("</b> · ").append(esc(WHEN.format(out.start()))).append(" · ")
                .append(esc(EmailService.formatDuration(out.durationMs()))).append(out.end() == null ? " · <span class=\"down-text\">ongoing</span>" : "")
                .append("</p>");
        }
        h.append("</section><footer>Monitored by Uptime Sentry. Refreshes every minute.</footer></main></body></html>");
        return h.toString();
    }

    private static String stateLabel(String state) {
        return switch (state) {
            case "up" -> "Operational";
            case "down" -> "Down";
            case "maintenance" -> "Maintenance";
            case "paused" -> "Paused";
            default -> "No data";
        };
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static String esc(String v) {
        return ReportScheduler.esc(v);
    }

    private static final String CSS = """
        :root{--bg:#E6E8EB;--card:#fff;--ink:#0B0D10;--muted:#4A4F56;--rule:#E6E8EB;--g:#1E8E3E;--w:#E0A21B;--b:#D7261E;--m:#5F7E9D;--n:#C8CBD0}
        @media (prefers-color-scheme:dark){:root{--bg:#0B0D10;--card:#16181C;--ink:#F2F2EE;--muted:#9A9FA6;--rule:#2A2D33;--g:#5CC97A;--w:#F0B429;--b:#FF6B63;--m:#8DA4BC;--n:#2A2D33}}
        *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
        main{max-width:820px;margin:0 auto;padding:32px 16px 48px}
        .eyebrow{font:600 11px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
        h1{margin:4px 0 20px;font-size:34px;line-height:1.1;font-weight:800;letter-spacing:-.01em}
        h2{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:24px 0 8px}
        .banner{display:flex;align-items:center;gap:10px;padding:16px 18px;border-radius:10px;font-weight:700;font-size:17px;color:#fff;background:var(--g)}
        .banner.partial_outage,.banner.major_outage{background:var(--b)}.banner.maintenance{background:var(--m)}
        .banner .dot{width:10px;height:10px;border-radius:50%;background:#fff}.banner .at{margin-left:auto;font:500 12px ui-monospace,Consolas,monospace;opacity:.85}
        .notice{margin-top:12px;padding:12px 16px;border-radius:10px;background:var(--card);border-left:4px solid var(--m)}.notice p{margin:4px 0 0;color:var(--muted)}
        .list{margin-top:16px;background:var(--card);border-radius:10px;padding:4px 18px}
        article{padding:14px 0;border-bottom:1px solid var(--rule)}article:last-child{border-bottom:0}
        .row{display:flex;justify-content:space-between;align-items:center;gap:12px}.name{min-width:0}.name b{display:block}
        .host{display:block;font:12px ui-monospace,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}
        .state{flex-shrink:0;font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:4px;border:1px solid var(--rule)}
        .state.up{color:var(--g)}.state.down{background:var(--b);color:#fff;border-color:var(--b)}.state.maintenance{color:var(--m)}.state.paused,.state.pending{color:var(--muted)}
        .bars{display:grid;grid-template-columns:repeat(30,1fr);gap:2px;margin-top:10px;height:28px}
        .bars i{border-radius:2px;background:var(--n)}.bars i.g{background:var(--g)}.bars i.w{background:var(--w)}.bars i.b{background:var(--b)}.bars i.m{background:var(--m)}
        .meta{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font:12px ui-monospace,Consolas,monospace;color:var(--muted)}
        .side{margin-top:16px;background:var(--card);border-radius:10px;padding:2px 18px 10px}.side h2{margin-top:14px}.side p{margin:6px 0}
        .muted{color:var(--muted)}.down-text{color:var(--b);font-weight:600}
        footer{margin-top:24px;font-size:12px;color:var(--muted);text-align:center}
        @media (max-width:560px){.meta span:first-child,.meta span:last-child{display:none}h1{font-size:28px}}
        """;
}
