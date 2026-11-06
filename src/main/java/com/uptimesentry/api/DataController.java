package com.uptimesentry.api;

import java.lang.reflect.Type;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.uptimesentry.model.CheckResult;
import com.uptimesentry.model.MaintenanceWindow;
import com.uptimesentry.model.ReportSchedule;
import com.uptimesentry.model.Webhook;
import com.uptimesentry.persistence.AppData;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.SettingsRepository.AppSettings;
import com.uptimesentry.service.ReportScheduler;
import com.uptimesentry.service.StatusPage;
import com.uptimesentry.service.WebhookService;
import com.uptimesentry.util.SentryLogger;

import io.javalin.http.Context;

/** Maintenance windows, webhooks, scheduled reports, outage notes, the status page and backups. */
public class DataController {

    private static final ObjectMapper MAPPER = new ObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final Gson GSON = new Gson();
    private static final java.time.format.DateTimeFormatter MINUTE = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final ReportScheduler scheduler;
    private final StatusPage statusPage;

    public DataController(ReportScheduler scheduler, StatusPage statusPage) {
        this.scheduler = scheduler;
        this.statusPage = statusPage;
    }

    // ── Maintenance ─────────────────────────────────────────────────────────

    /** GET /api/maintenance: the windows, each with activeNow and nextStart. */
    public void getMaintenance(Context ctx) {
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> out = new ArrayList<>();
        for (MaintenanceWindow w : AppData.maintenance()) {
            Map<String, Object> m = MAPPER.convertValue(w, new TypeReference<LinkedHashMap<String, Object>>() { });
            m.put("activeNow", w.isActive(now));
            LocalDateTime next = w.nextStart(now);
            m.put("nextStart", next == null ? null : next.format(MINUTE));
            out.add(m);
        }
        ctx.json(out);
    }

    public void putMaintenance(Context ctx) throws Exception {
        List<MaintenanceWindow> list = MAPPER.readValue(ctx.body(), new TypeReference<List<MaintenanceWindow>>() { });
        AppData.saveMaintenance(list);
        SentryLogger.info("Maintenance windows saved (" + list.size() + ").");
        getMaintenance(ctx);
    }

    // ── Webhooks ────────────────────────────────────────────────────────────

    public void getWebhooks(Context ctx) {
        ctx.json(AppData.webhooks());
    }

    public void putWebhooks(Context ctx) throws Exception {
        List<Webhook> list = MAPPER.readValue(ctx.body(), new TypeReference<List<Webhook>>() { });
        AppData.saveWebhooks(list);
        ctx.json(AppData.webhooks());
    }

    /** POST /api/webhooks/test with one webhook (saved or not): sends a sample alert. */
    public void testWebhook(Context ctx) {
        try {
            Webhook w = MAPPER.readValue(ctx.body(), Webhook.class);
            WebhookService.sendTest(w);
            ctx.json(Map.of("ok", true, "message", "Test message delivered."));
        } catch (Exception e) {
            ctx.json(Map.of("ok", false, "message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
    }

    // ── Scheduled reports ───────────────────────────────────────────────────

    public void getSchedules(Context ctx) {
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> out = new ArrayList<>();
        for (ReportSchedule s : AppData.schedules()) {
            Map<String, Object> m = MAPPER.convertValue(s, new TypeReference<LinkedHashMap<String, Object>>() { });
            m.put("nextSend", s.enabled ? s.nextDue(now).format(MINUTE) : null);
            out.add(m);
        }
        ctx.json(out);
    }

    public void putSchedules(Context ctx) throws Exception {
        List<ReportSchedule> list = MAPPER.readValue(ctx.body(), new TypeReference<List<ReportSchedule>>() { });
        AppData.saveSchedules(list);
        getSchedules(ctx);
    }

    /** POST /api/schedules/send with one schedule: emails its report for the period that just ended. */
    public void sendSchedule(Context ctx) {
        try {
            ReportSchedule s = MAPPER.readValue(ctx.body(), ReportSchedule.class);
            scheduler.send(s, LocalDateTime.now());
            ctx.json(Map.of("ok", true, "message", "Report sent to " + String.join(", ", s.recipients) + "."));
        } catch (Exception e) {
            ctx.json(Map.of("ok", false, "message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
    }

    // ── Outage notes ────────────────────────────────────────────────────────

    public void getNotes(Context ctx) {
        ctx.json(AppData.notes());
    }

    /** PUT /api/notes {outageId, notes: [{time, text}]}: replaces one outage's notes. */
    public void putNotes(Context ctx) throws Exception {
        JsonNode body = MAPPER.readTree(ctx.body());
        String id = body.path("outageId").asText("");
        if (id.isBlank()) {
            ctx.status(400).result("outageId is required");
            return;
        }
        List<AppData.Note> notes = MAPPER.convertValue(body.path("notes"), new TypeReference<List<AppData.Note>>() { });
        AppData.saveNotes(id, notes);
        ctx.json(AppData.notes());
    }

    /** POST /api/notes/merge {outageId: [notes]}: adds notes that aren't there yet (moving notes kept by older versions). */
    public void mergeNotes(Context ctx) throws Exception {
        Map<String, List<AppData.Note>> incoming = MAPPER.readValue(ctx.body(), new TypeReference<LinkedHashMap<String, List<AppData.Note>>>() { });
        Map<String, List<AppData.Note>> all = AppData.notes();
        incoming.forEach((id, list) -> {
            List<AppData.Note> have = all.computeIfAbsent(id, k -> new ArrayList<>());
            for (AppData.Note n : list) {
                if (n == null || n.text == null || n.text.isBlank()) continue;
                boolean dup = have.stream().anyMatch(h -> n.text.equals(h.text) && java.util.Objects.equals(n.time, h.time));
                if (!dup) have.add(n);
            }
        });
        AppData.replaceAllNotes(all);
        ctx.json(AppData.notes());
    }

    // ── Status page ─────────────────────────────────────────────────────────

    public void statusHtml(Context ctx) {
        if (!SettingsRepository.loadSettings().statusPageEnabled) {
            ctx.status(404).html("<p style=\"font-family:sans-serif\">The status page is switched off. Turn it on in Uptime Sentry's Settings.</p>");
            return;
        }
        ctx.html(statusPage.html());
    }

    public void statusJson(Context ctx) {
        if (!SettingsRepository.loadSettings().statusPageEnabled) {
            ctx.status(404).json(Map.of("message", "The status page is switched off."));
            return;
        }
        ctx.json(statusPage.json());
    }

    public void statusInfo(Context ctx) {
        ctx.json(statusPage.info());
    }

    /** POST /api/status/open: opens the status page in the default browser (only this fixed address). */
    public void openStatus(Context ctx) {
        try {
            if (!java.awt.Desktop.isDesktopSupported() || !java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                ctx.json(Map.of("ok", false, "message", "No browser could be opened. Open http://127.0.0.1:8765/status yourself."));
                return;
            }
            java.awt.Desktop.getDesktop().browse(java.net.URI.create("http://127.0.0.1:8765/status"));
            ctx.json(Map.of("ok", true, "message", "Opened in your browser."));
        } catch (Exception e) {
            ctx.json(Map.of("ok", false, "message", "No browser could be opened. Open http://127.0.0.1:8765/status yourself."));
        }
    }

    // ── Backup ──────────────────────────────────────────────────────────────

    /** GET /api/backup: everything the service keeps except history and the mail password. */
    public void getBackup(Context ctx) {
        AppSettings s = SettingsRepository.loadSettings().copy();
        s.smtpPassword = null;
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> settings = MAPPER.convertValue(s, new TypeReference<LinkedHashMap<String, Object>>() { });
        settings.remove("smtpPassword");
        out.put("settings", settings);
        out.put("maintenance", AppData.maintenance());
        out.put("webhooks", AppData.webhooks());
        out.put("schedules", AppData.schedules());
        out.put("notes", AppData.notes());
        ctx.json(out);
    }

    /** POST /api/backup: restores what GET /api/backup returned. Missing parts are left as they are. */
    public void restoreBackup(Context ctx) throws Exception {
        JsonNode body = MAPPER.readTree(ctx.body());
        if (body.has("settings")) {
            JsonNode settings = body.get("settings");
            if (settings instanceof com.fasterxml.jackson.databind.node.ObjectNode o) {
                o.remove("smtpPassword");
                o.remove("smtpPasswordSet");
                o.remove("passwordStore");
            }
            AppSettings updated = MAPPER.readerForUpdating(new AppSettings()).readValue(settings);
            SettingsRepository.saveSettings(updated);
        }
        if (body.has("maintenance")) AppData.saveMaintenance(MAPPER.convertValue(body.get("maintenance"), new TypeReference<List<MaintenanceWindow>>() { }));
        if (body.has("webhooks")) AppData.saveWebhooks(MAPPER.convertValue(body.get("webhooks"), new TypeReference<List<Webhook>>() { }));
        if (body.has("schedules")) AppData.saveSchedules(MAPPER.convertValue(body.get("schedules"), new TypeReference<List<ReportSchedule>>() { }));
        if (body.has("notes")) AppData.replaceAllNotes(MAPPER.convertValue(body.get("notes"), new TypeReference<LinkedHashMap<String, List<AppData.Note>>>() { }));
        statusPage.applySettings();
        SentryLogger.info("Backup restored.");
        ctx.status(204);
    }

    /** POST /api/history/import: replaces the check history with the checks in the body. */
    public void importHistory(Context ctx) {
        Type type = new TypeToken<List<CheckResult>>() { }.getType();
        List<CheckResult> list = GSON.fromJson(ctx.body(), type);
        List<CheckResult> clean = new ArrayList<>();
        for (CheckResult c : list == null ? List.<CheckResult>of() : list) {
            if (c != null && c.getTimestamp() != null) clean.add(c);
        }
        HistoryRepository.saveHistory(clean);
        SentryLogger.info("Check history imported (" + clean.size() + " checks).");
        ctx.json(Map.of("checks", clean.size()));
    }
}
