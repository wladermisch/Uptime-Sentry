package com.uptimesentry.service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import com.uptimesentry.model.CheckResult;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.model.ReportSchedule;
import com.uptimesentry.persistence.AppData;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.util.SentryLogger;

/**
 * Emails availability reports on their schedules. Looks once a minute; a report that fell due while
 * the app was closed is sent when it starts again, as long as that was within the last day.
 */
public class ReportScheduler {

    static final DateTimeFormatter SENT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.ENGLISH);

    private final List<MonitoredTarget> targets;
    private ScheduledExecutorService timer;

    public ReportScheduler(List<MonitoredTarget> targets) {
        this.targets = targets;
    }

    public synchronized void start() {
        if (timer != null) return;
        timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "report-scheduler");
            t.setDaemon(true);
            return t;
        });
        timer.scheduleAtFixedRate(() -> {
            try {
                tick(LocalDateTime.now());
            } catch (Throwable t) {
                SentryLogger.error("Scheduled reports: " + t.getMessage());
            }
        }, 20, 60, TimeUnit.SECONDS);
    }

    void tick(LocalDateTime now) {
        for (ReportSchedule s : AppData.schedules()) {
            if (!s.enabled || s.recipients == null || s.recipients.isEmpty()) continue;
            LocalDateTime due = s.lastDue(now);
            if (due.isBefore(now.minusDays(1))) continue;
            LocalDateTime last = parseSent(s.lastSent);
            if (last != null && !last.isBefore(due)) continue;
            try {
                send(s, due);
                AppData.markScheduleSent(s.id, now.format(SENT), null);
                SentryLogger.info("Scheduled report \"" + s.name + "\" sent to " + String.join(", ", s.recipients));
            } catch (IOException | RuntimeException e) {
                // Mark it as handled so a broken mail setup doesn't retry every minute; the error is shown in the app.
                AppData.markScheduleSent(s.id, now.format(SENT), e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                SentryLogger.error("Scheduled report \"" + s.name + "\" failed: " + e.getMessage());
            }
        }
    }

    static LocalDateTime parseSent(String v) {
        try {
            return v == null ? null : LocalDateTime.parse(v, SENT);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Sends the report for the period before {@code at} now (the "Send now" button). */
    public void send(ReportSchedule s, LocalDateTime at) throws IOException {
        if (s.recipients == null || s.recipients.isEmpty()) throw new IOException("Add at least one recipient.");
        LocalDateTime[] period = s.periodFor(at);
        Report r = build(s, period[0], period[1], LocalDateTime.now());
        SmtpClient.send(EmailService.server(SettingsRepository.loadSettings()), s.recipients, r.subject, r.text, r.html);
    }

    record Row(MonitoredTarget target, UptimeStats.Figures f) {
    }

    record Report(String subject, String text, String html) {
    }

    Report build(ReportSchedule s, LocalDateTime from, LocalDateTime to, LocalDateTime now) {
        List<MonitoredTarget> scoped = new ArrayList<>();
        synchronized (targets) {
            for (MonitoredTarget t : targets) if (s.covers(t)) scoped.add(t);
        }
        Map<Integer, List<CheckResult>> byTarget = new LinkedHashMap<>();
        // Checks from a little before the period, so an outage already running at the start is included.
        List<CheckResult> history = HistoryRepository.query(from.minusDays(2).format(UptimeStats.TS), to.format(UptimeStats.TS), null, 2_000_000);
        for (CheckResult c : history) byTarget.computeIfAbsent(c.getTargetId(), k -> new ArrayList<>()).add(c);

        List<Row> rows = new ArrayList<>();
        int checks = 0;
        int failed = 0;
        int outages = 0;
        long downtime = 0;
        double msSum = 0;
        int msCount = 0;
        for (MonitoredTarget t : scoped) {
            UptimeStats.Figures f = UptimeStats.compute(byTarget.getOrDefault(t.getId(), List.of()), from, to, now);
            rows.add(new Row(t, f));
            checks += f.checks();
            failed += f.failed();
            outages += f.outages().size();
            downtime += f.downtimeMs();
            if (f.avgMs() != null) {
                msSum += f.avgMs() * (f.checks() - f.failed());
                msCount += f.checks() - f.failed();
            }
        }
        Double availability = checks == 0 ? null : (checks - failed) * 100.0 / checks;
        Double avg = msCount == 0 ? null : msSum / msCount;
        String period = DAY.format(from) + " – " + DAY.format(to.minusSeconds(1));
        Map<String, List<AppData.Note>> notes = AppData.notes();

        String verdict;
        if (availability == null) verdict = "No checks were recorded in this period.";
        else if (s.sla != null) verdict = (availability >= s.sla ? "Meets" : "Misses") + " the " + trim(s.sla) + "% target.";
        else verdict = "";

        String subject = "[Uptime Sentry] " + (s.name == null || s.name.isBlank() ? "Uptime report" : s.name) + ": "
            + UptimeStats.pct(availability) + " · " + period;

        // Plain text
        StringBuilder text = new StringBuilder();
        text.append(s.name).append('\n').append(period).append("\n\n");
        text.append("Availability:  ").append(UptimeStats.pct(availability)).append(verdict.isEmpty() ? "" : "  (" + verdict + ")").append('\n');
        text.append("Outages:       ").append(outages).append('\n');
        text.append("Downtime:      ").append(EmailService.formatDuration(downtime)).append('\n');
        text.append("Avg response:  ").append(UptimeStats.ms(avg)).append("\n\n");
        for (Row r : rows) {
            text.append(String.format(Locale.ROOT, "%-28s %9s  %3d outages  %10s  %s%n", cut(r.target.getName(), 28), UptimeStats.pct(r.f.availability()),
                r.f.outages().size(), EmailService.formatDuration(r.f.downtimeMs()), UptimeStats.ms(r.f.avgMs())));
        }
        if (s.includeOutages && outages > 0) {
            text.append("\nOutages\n");
            for (Row r : rows) {
                for (UptimeStats.Outage o : r.f.outages()) {
                    text.append("- ").append(r.target.getName()).append(", ").append(WHEN.format(o.start())).append(", ")
                        .append(EmailService.formatDuration(o.durationMs())).append(o.end() == null ? " (ongoing)" : "")
                        .append(": ").append(nz(o.cause())).append('\n');
                    for (AppData.Note n : notes.getOrDefault(r.target.getId() + "-" + o.firstCheckTs(), List.of())) {
                        text.append("    Note: ").append(n.text).append('\n');
                    }
                }
            }
        }
        text.append("\nSent by Uptime Sentry on ").append(EmailService.computerName()).append(". Checks during maintenance windows are not counted.\n");

        // HTML
        String ink = "#0B0D10";
        String muted = "#4A4F56";
        String rule = "#E6E8EB";
        String red = "#B3201A";
        StringBuilder h = new StringBuilder();
        h.append("<!doctype html><html><body style=\"margin:0;padding:24px;background:#F5F6F7;font-family:Segoe UI,Arial,sans-serif;color:").append(ink).append("\">");
        h.append("<table role=\"presentation\" width=\"100%\" style=\"max-width:720px;margin:0 auto;background:#fff;border:1px solid ").append(rule).append(";border-radius:10px\"><tr><td style=\"padding:28px\">");
        h.append("<div style=\"font:600 11px Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:").append(muted).append("\">Uptime Sentry · availability report</div>");
        h.append("<h1 style=\"margin:6px 0 2px;font-size:26px\">").append(esc(s.name)).append("</h1>");
        h.append("<div style=\"color:").append(muted).append(";font-size:14px\">").append(esc(period)).append("</div>");
        h.append("<table role=\"presentation\" width=\"100%\" style=\"margin:22px 0;border-collapse:collapse\"><tr>");
        kpi(h, "Availability", UptimeStats.pct(availability), verdict, availability != null && s.sla != null && availability < s.sla);
        kpi(h, "Outages", String.valueOf(outages), "", false);
        kpi(h, "Downtime", EmailService.formatDuration(downtime), "", false);
        kpi(h, "Avg response", UptimeStats.ms(avg), "", false);
        h.append("</tr></table>");
        h.append("<table width=\"100%\" style=\"border-collapse:collapse;font-size:13px\"><tr>");
        for (String col : new String[] { "Target", "Availability", "Outages", "Downtime", "Avg response" }) {
            h.append("<th align=\"").append(col.equals("Target") ? "left" : "right").append("\" style=\"padding:8px 6px;border-bottom:2px solid ")
                .append(ink).append(";font:600 11px Consolas,monospace;letter-spacing:.08em;text-transform:uppercase\">").append(col).append("</th>");
        }
        h.append("</tr>");
        for (Row r : rows) {
            boolean low = r.f.availability() != null && s.sla != null && r.f.availability() < s.sla;
            h.append("<tr><td style=\"padding:8px 6px;border-bottom:1px solid ").append(rule).append("\"><b>").append(esc(r.target.getName()))
                .append("</b><br><span style=\"color:").append(muted).append(";font:12px Consolas,monospace\">").append(esc(r.target.getType())).append(" · ")
                .append(esc(r.target.getHost())).append("</span></td>");
            cell(h, UptimeStats.pct(r.f.availability()), low ? red : ink, true, rule);
            cell(h, String.valueOf(r.f.outages().size()), ink, false, rule);
            cell(h, EmailService.formatDuration(r.f.downtimeMs()), ink, false, rule);
            cell(h, UptimeStats.ms(r.f.avgMs()), ink, false, rule);
            h.append("</tr>");
        }
        if (rows.isEmpty()) h.append("<tr><td colspan=\"5\" style=\"padding:12px 6px;color:").append(muted).append("\">No targets in this report's scope.</td></tr>");
        h.append("</table>");
        if (s.includeOutages && outages > 0) {
            h.append("<h2 style=\"font-size:16px;margin:26px 0 8px\">Outages</h2>");
            for (Row r : rows) {
                for (UptimeStats.Outage o : r.f.outages()) {
                    h.append("<div style=\"padding:8px 0;border-bottom:1px solid ").append(rule).append(";font-size:13px\"><b>").append(esc(r.target.getName()))
                        .append("</b> · ").append(esc(WHEN.format(o.start()))).append(" · ").append(esc(EmailService.formatDuration(o.durationMs())))
                        .append(o.end() == null ? " · <span style=\"color:" + red + "\">ongoing</span>" : "")
                        .append("<br><span style=\"color:").append(muted).append("\">").append(esc(nz(o.cause()))).append("</span>");
                    for (AppData.Note n : notes.getOrDefault(r.target.getId() + "-" + o.firstCheckTs(), List.of())) {
                        h.append("<br><span style=\"color:").append(ink).append("\">Note: ").append(esc(n.text)).append("</span>");
                    }
                    h.append("</div>");
                }
            }
        }
        h.append("<p style=\"margin:24px 0 0;color:").append(muted).append(";font-size:12px\">Sent by Uptime Sentry on ").append(esc(EmailService.computerName()))
            .append(". Availability is the share of successful checks; checks during maintenance windows are not counted.</p>");
        h.append("</td></tr></table></body></html>");
        return new Report(subject, text.toString(), h.toString());
    }

    private static void kpi(StringBuilder h, String label, String value, String sub, boolean alert) {
        h.append("<td style=\"padding:0 12px 0 0;vertical-align:top\"><div style=\"font:600 10px Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#4A4F56\">")
            .append(esc(label)).append("</div><div style=\"font:700 22px Consolas,monospace;color:").append(alert ? "#B3201A" : "#0B0D10").append("\">")
            .append(esc(value)).append("</div>");
        if (!sub.isEmpty()) h.append("<div style=\"font-size:12px;color:#4A4F56\">").append(esc(sub)).append("</div>");
        h.append("</td>");
    }

    private static void cell(StringBuilder h, String v, String color, boolean bold, String rule) {
        h.append("<td align=\"right\" style=\"padding:8px 6px;border-bottom:1px solid ").append(rule).append(";font-family:Consolas,monospace;white-space:nowrap;color:")
            .append(color).append(bold ? ";font-weight:700" : "").append("\">").append(esc(v)).append("</td>");
    }

    static String esc(String v) {
        if (v == null) return "";
        return v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String nz(String v) {
        return v == null || v.isBlank() ? "Check failed" : v;
    }

    private static String cut(String v, int n) {
        if (v == null) return "";
        return v.length() <= n ? v : v.substring(0, n - 1) + "…";
    }

    private static String trim(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
