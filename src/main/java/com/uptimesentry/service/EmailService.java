package com.uptimesentry.service;

import java.io.IOException;
import java.net.InetAddress;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.SettingsRepository.AppSettings;
import com.uptimesentry.util.SentryLogger;

/**
 * Sends outage and recovery emails for a target, using its recipients and templates.
 * Templates use {placeholders}; see {@link #variables}. Sending runs on a background thread
 * so a slow mail server never delays checks.
 */
public class EmailService {

    public static final String DEFAULT_DOWN_SUBJECT = "[Uptime Sentry] {target} is DOWN";
    public static final String DEFAULT_DOWN_BODY = String.join("\n",
        "{target} stopped responding.",
        "",
        "Target:         {target} ({type})",
        "Address:        {host}",
        "Profile:        {profile}",
        "Down since:     {downSince}",
        "Failed checks:  {failures}",
        "Reason:         {reason}",
        "",
        "Checked from {computer} by Uptime Sentry.");
    public static final String DEFAULT_UP_SUBJECT = "[Uptime Sentry] {target} is back UP";
    public static final String DEFAULT_UP_BODY = String.join("\n",
        "{target} is responding again.",
        "",
        "Target:         {target} ({type})",
        "Address:        {host}",
        "Profile:        {profile}",
        "Down since:     {downSince}",
        "Recovered at:   {time}",
        "Downtime:       {duration}",
        "Response time:  {responseTime}",
        "",
        "Checked from {computer} by Uptime Sentry.");

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-zA-Z]+)\\}");

    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "email-sender");
        t.setDaemon(true);
        return t;
    });

    /** Facts about one outage, filled into the templates. */
    public record Outage(String downSince, String time, long durationMs, int failures, String reason, long responseTimeMs) {
    }

    public void sendDown(MonitoredTarget target, Outage outage) {
        send(target, outage, false);
    }

    public void sendRecovery(MonitoredTarget target, Outage outage) {
        if (target.isEmailOnRecovery()) send(target, outage, true);
    }

    private void send(MonitoredTarget target, Outage outage, boolean recovered) {
        List<String> to = target.getEmailRecipients();
        if (to == null || to.isEmpty()) return;
        Map<String, String> vars = variables(target, outage, recovered);
        String subject = render(orDefault(recovered ? target.getEmailUpSubject() : target.getEmailDownSubject(),
            recovered ? DEFAULT_UP_SUBJECT : DEFAULT_DOWN_SUBJECT), vars);
        String body = render(orDefault(recovered ? target.getEmailUpBody() : target.getEmailDownBody(),
            recovered ? DEFAULT_UP_BODY : DEFAULT_DOWN_BODY), vars);
        List<String> recipients = List.copyOf(to);
        sender.submit(() -> {
            try {
                SmtpClient.send(server(SettingsRepository.loadSettings()), recipients, subject, body);
                SentryLogger.info("Outage email sent for " + target.getName() + " to " + String.join(", ", recipients));
            } catch (SmtpClient.PartialDeliveryException e) {
                SentryLogger.warn("Outage email for " + target.getName() + ": " + e.getMessage());
            } catch (IOException | RuntimeException e) {
                SentryLogger.error("Outage email for " + target.getName() + " failed: " + e.getMessage());
            }
        });
    }

    /** Response-time alerts go to the same recipients; "fast again" only when recovery emails are on. */
    public void sendSlowness(Alert alert) {
        MonitoredTarget target = alert.target();
        List<String> to = target.getEmailRecipients();
        if (to == null || to.isEmpty()) return;
        if (Alert.NORMAL.equals(alert.kind()) && !target.isEmailOnRecovery()) return;
        String subject = "[Uptime Sentry] " + alert.headline();
        String body = String.join("\n",
            alert.headline() + ".",
            "",
            "Target:         " + target.getName() + " (" + target.getType() + ")",
            "Address:        " + nz(target.getHost()),
            "Profile:        " + nz(target.getProfileName()),
            "Slow since:     " + alert.since(),
            "Response time:  " + (alert.responseMs() >= 0 ? alert.responseMs() + " ms" : "n/a"),
            "Limit:          " + target.getDegradedLatencyThreshold() + " ms",
            "",
            alert.details(),
            "",
            "Checked from " + computerName() + " by Uptime Sentry.");
        List<String> recipients = List.copyOf(to);
        sender.submit(() -> {
            try {
                SmtpClient.send(server(SettingsRepository.loadSettings()), recipients, subject, body);
            } catch (IOException | RuntimeException e) {
                SentryLogger.error("Response time email for " + target.getName() + " failed: " + e.getMessage());
            }
        });
    }

    /** Sends a sample message right away (for the "Send test email" buttons). Throws with the reason on failure. */
    public static void sendTest(SmtpClient.Server server, List<String> recipients, String subjectTemplate, String bodyTemplate, boolean recovered)
        throws IOException {
        MonitoredTarget sample = new MonitoredTarget(0, "Example website", "HTTP", "https://example.com", 5, "", List.of(), 2, "Standard Profile");
        String now = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String earlier = java.time.LocalDateTime.now().minusMinutes(7).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        Outage o = new Outage(earlier, now, 7 * 60_000L, 3, "HTTP 503 (not an accepted status)", 184);
        Map<String, String> vars = variables(sample, o, recovered);
        String subject = render(orDefault(subjectTemplate, recovered ? DEFAULT_UP_SUBJECT : DEFAULT_DOWN_SUBJECT), vars);
        String body = render(orDefault(bodyTemplate, recovered ? DEFAULT_UP_BODY : DEFAULT_DOWN_BODY), vars);
        SmtpClient.send(server, recipients, "[Test] " + subject,
            "This is a test message from Uptime Sentry with example values.\n\n" + body);
    }

    public static SmtpClient.Server server(AppSettings s) {
        // A password typed for a test send (not saved yet) wins; otherwise use the stored one.
        String password = s.smtpPassword != null && !s.smtpPassword.isEmpty()
            ? s.smtpPassword
            : com.uptimesentry.persistence.SecretStore.get(com.uptimesentry.persistence.SecretStore.SMTP_PASSWORD);
        return new SmtpClient.Server(s.smtpHost, s.smtpPort, s.smtpSecurity, s.smtpUsername, password, s.smtpFrom, s.smtpFromName);
    }

    static Map<String, String> variables(MonitoredTarget t, Outage o, boolean recovered) {
        Map<String, String> v = new LinkedHashMap<>();
        v.put("target", nz(t.getName()));
        v.put("host", nz(t.getHost()));
        v.put("type", "PING".equalsIgnoreCase(t.getType()) ? "Ping" : "HTTP");
        v.put("profile", nz(t.getProfileName()));
        v.put("status", recovered ? "UP" : "DOWN");
        v.put("time", nz(o.time()));
        v.put("downSince", nz(o.downSince()));
        v.put("duration", formatDuration(o.durationMs()));
        v.put("failures", String.valueOf(o.failures()));
        v.put("reason", o.reason() == null || o.reason().isBlank() ? "Check failed" : o.reason());
        v.put("responseTime", o.responseTimeMs() >= 0 ? o.responseTimeMs() + " ms" : "n/a");
        v.put("computer", computerName());
        return v;
    }

    static String render(String template, Map<String, String> vars) {
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String value = vars.get(m.group(1));
            m.appendReplacement(sb, Matcher.quoteReplacement(value != null ? value : m.group(0)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    static String formatDuration(long ms) {
        long s = Math.max(0, ms / 1000);
        if (s < 60) return s + " s";
        long m = s / 60;
        if (m < 60) return m + " min";
        long h = m / 60;
        if (h < 24) return h + " h " + (m % 60) + " min";
        return (h / 24) + " d " + (h % 24) + " h";
    }

    private static String orDefault(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static String nz(String v) {
        return v == null ? "" : v;
    }

    static String computerName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (IOException e) {
            return "this computer";
        }
    }
}
