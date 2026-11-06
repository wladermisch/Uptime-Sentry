package com.uptimesentry.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.google.gson.Gson;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.model.Webhook;
import com.uptimesentry.persistence.AppData;
import com.uptimesentry.util.SentryLogger;

/**
 * Posts alerts to webhooks in the format the receiving service expects: plain JSON, Slack,
 * Discord, Microsoft Teams (Workflows) or ntfy. Sends on a background thread.
 */
public class WebhookService {

    private static final Gson GSON = new Gson();
    private static final int TIMEOUT_MS = 10_000;

    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "webhook-sender");
        t.setDaemon(true);
        return t;
    });

    public void send(Alert alert) {
        for (Webhook w : AppData.webhooks()) {
            if (!w.wants(alert.kind(), alert.target())) continue;
            sender.submit(() -> {
                try {
                    post(w, alert);
                } catch (IOException | RuntimeException e) {
                    SentryLogger.warn("Webhook \"" + label(w) + "\" failed: " + e.getMessage());
                }
            });
        }
    }

    /** Sends a sample alert right away; throws with a readable reason on failure. */
    public static void sendTest(Webhook w) throws IOException {
        MonitoredTarget sample = new MonitoredTarget(0, "Example website", "HTTP", "https://example.com", 5, "", List.of(), 2, "Standard Profile");
        String now = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        post(w, new Alert(Alert.DOWN, sample, now, now, 0, 2, "Test message from Uptime Sentry: HTTP 503", -1));
    }

    private static String label(Webhook w) {
        return w.name == null || w.name.isBlank() ? w.url : w.name;
    }

    static void post(Webhook w, Alert a) throws IOException {
        URI uri;
        try {
            uri = URI.create(w.url.trim());
        } catch (IllegalArgumentException e) {
            throw new IOException("Not a valid address");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("https") && !scheme.equals("http")) throw new IOException("The address must start with https://");

        String format = w.format == null ? "GENERIC" : w.format.toUpperCase();
        HttpURLConnection c = (HttpURLConnection) uri.toURL().openConnection();
        c.setConnectTimeout(TIMEOUT_MS);
        c.setReadTimeout(TIMEOUT_MS);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("User-Agent", "UptimeSentry");
        byte[] body;
        if (format.equals("NTFY")) {
            c.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            c.setRequestProperty("Title", asciiHeader(a.headline()));
            c.setRequestProperty("Priority", a.kind().equals(Alert.DOWN) ? "high" : "default");
            c.setRequestProperty("Tags", switch (a.kind()) {
                case Alert.DOWN -> "rotating_light";
                case Alert.UP -> "white_check_mark";
                case Alert.SLOW -> "turtle";
                default -> "zap";
            });
            body = a.details().getBytes(StandardCharsets.UTF_8);
        } else {
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            body = GSON.toJson(payload(format, a)).getBytes(StandardCharsets.UTF_8);
        }
        try (OutputStream out = c.getOutputStream()) {
            out.write(body);
        }
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) {
            String reply = "";
            try (InputStream err = c.getErrorStream()) {
                if (err != null) reply = new String(err.readNBytes(300), StandardCharsets.UTF_8).trim();
            }
            throw new IOException("HTTP " + code + (reply.isEmpty() ? "" : ": " + reply));
        }
    }

    /** ntfy reads the title from a header, which must be plain ASCII. */
    private static String asciiHeader(String v) {
        return v.replaceAll("[^\\x20-\\x7E]", "?");
    }

    private static Object payload(String format, Alert a) {
        String emoji = switch (a.kind()) {
            case Alert.DOWN -> "🔴";
            case Alert.UP -> "🟢";
            case Alert.SLOW -> "🟠";
            default -> "🔵";
        };
        String text = emoji + " " + a.headline() + "\n" + a.details();
        return switch (format) {
            case "SLACK" -> Map.of("text", "*" + emoji + " " + a.headline() + "*\n" + a.details());
            case "DISCORD" -> Map.of("content", "**" + emoji + " " + a.headline() + "**\n" + a.details());
            case "TEAMS" -> {
                // Teams "Workflows" webhooks expect an Adaptive Card attachment.
                Map<String, Object> title = Map.of("type", "TextBlock", "text", emoji + " " + a.headline(), "weight", "Bolder", "size", "Medium", "wrap", true);
                Map<String, Object> details = Map.of("type", "TextBlock", "text", a.details().replace("\n", "\n\n"), "wrap", true);
                Map<String, Object> card = Map.of(
                    "type", "AdaptiveCard",
                    "$schema", "http://adaptivecards.io/schemas/adaptive-card.json",
                    "version", "1.4",
                    "body", List.of(title, details));
                yield Map.of("type", "message", "attachments", List.of(Map.of("contentType", "application/vnd.microsoft.card.adaptive", "content", card)));
            }
            default -> {
                MonitoredTarget t = a.target();
                Map<String, Object> target = new LinkedHashMap<>();
                target.put("id", t.getId());
                target.put("name", t.getName());
                target.put("type", t.getType());
                target.put("host", t.getHost());
                target.put("profile", t.getProfileName());
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("event", a.kind());
                m.put("text", text);
                m.put("target", target);
                m.put("time", a.time());
                m.put("since", a.since());
                m.put("durationSeconds", a.durationMs() / 1000);
                m.put("checks", a.checks());
                m.put("message", a.message());
                m.put("responseTimeMs", a.responseMs());
                m.put("source", "Uptime Sentry");
                yield m;
            }
        };
    }
}
