package com.uptimesentry.api;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.persistence.AppData;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.persistence.SecretStore;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.TargetRepository;
import com.uptimesentry.service.AutoCheckService;
import com.uptimesentry.service.NotificationService;
import com.uptimesentry.service.ReportScheduler;
import com.uptimesentry.service.StatusPage;
import com.uptimesentry.util.SentryLogger;

import io.javalin.Javalin;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * ApiServer bootstraps the Javalin HTTP server for the REST API on port 8765.
 */
public class ApiServer {

    public static final int PORT = 8765;
    static final Path TARGETS_FILE = Paths.get("targets.json");

    private final Javalin app;
    private final List<MonitoredTarget> targets;
    private final AutoCheckService autoCheckService;
    private final ReportScheduler reportScheduler;
    private final StatusPage statusPage;

    public ApiServer() throws Exception {
        this.targets = TargetRepository.loadTargets(TARGETS_FILE);
        NotificationService notificationService = new NotificationService();
        this.autoCheckService = new AutoCheckService(targets, 60, notificationService);
        this.autoCheckService.startAutoChecks();
        this.reportScheduler = new ReportScheduler(targets);
        this.reportScheduler.start();
        this.statusPage = new StatusPage(targets);
        SettingsController.onSaved = statusPage::applySettings;

        this.app = Javalin.create(config ->
            config.bundledPlugins.enableCors(cors ->
                cors.addRule(it -> it.anyHost())
            )
        );

        registerRoutes();
    }

    private void registerRoutes() {
        TargetsController targetsCtrl = new TargetsController(targets, TARGETS_FILE, autoCheckService);
        HistoryController historyCtrl = new HistoryController();
        AutoCheckController autoCheckCtrl = new AutoCheckController(autoCheckService);
        AudioController audioCtrl = new AudioController();
        SettingsController settingsCtrl = new SettingsController();
        EmailController emailCtrl = new EmailController();
        DataController dataCtrl = new DataController(reportScheduler, statusPage);

        app.get("/api/targets",             targetsCtrl::getAll);
        app.post("/api/targets",            targetsCtrl::add);
        app.put("/api/targets",             targetsCtrl::syncAll);
        app.put("/api/targets/{id}",        targetsCtrl::edit);
        app.delete("/api/targets/{id}",     targetsCtrl::remove);
        app.post("/api/targets/{id}/check", targetsCtrl::checkOne);
        app.post("/api/targets/check-dryrun", targetsCtrl::checkDryRun);
        app.post("/api/check/test",           targetsCtrl::checkDryRun);

        app.get("/api/history",             historyCtrl::getHistory);
        app.get("/api/history/stats",       historyCtrl::getStats);
        app.delete("/api/history",          historyCtrl::clearHistory);

        // Malformed request bodies are the caller's mistake: say what was wrong instead of a bare 500.
        app.exception(com.fasterxml.jackson.core.JsonProcessingException.class,
            (e, ctx) -> ctx.status(400).result("Invalid data: " + e.getOriginalMessage()));
        app.exception(com.google.gson.JsonParseException.class,
            (e, ctx) -> ctx.status(400).result("Invalid data: " + e.getMessage()));

        app.post("/api/history/import",     dataCtrl::importHistory);

        app.post("/api/email/test",         emailCtrl::sendTest);

        app.get("/api/maintenance",         dataCtrl::getMaintenance);
        app.put("/api/maintenance",         dataCtrl::putMaintenance);
        app.get("/api/webhooks",            dataCtrl::getWebhooks);
        app.put("/api/webhooks",            dataCtrl::putWebhooks);
        app.post("/api/webhooks/test",      dataCtrl::testWebhook);
        app.get("/api/schedules",           dataCtrl::getSchedules);
        app.put("/api/schedules",           dataCtrl::putSchedules);
        app.post("/api/schedules/send",     dataCtrl::sendSchedule);
        app.get("/api/notes",               dataCtrl::getNotes);
        app.put("/api/notes",               dataCtrl::putNotes);
        app.post("/api/notes/merge",        dataCtrl::mergeNotes);
        app.get("/api/backup",              dataCtrl::getBackup);
        app.post("/api/backup",             dataCtrl::restoreBackup);

        // Status page for this computer; StatusPage can also share it on the network on its own port.
        app.get("/status",                  dataCtrl::statusHtml);
        app.get("/api/status",              dataCtrl::statusJson);
        app.get("/api/status/info",         dataCtrl::statusInfo);
        app.post("/api/status/open",        dataCtrl::openStatus);

        DiscoveryController discoveryCtrl = new DiscoveryController();
        app.get("/api/discovery/networks",  discoveryCtrl::networks);
        app.post("/api/discovery/start",    discoveryCtrl::start);
        app.get("/api/discovery/status",    discoveryCtrl::status);
        app.post("/api/discovery/cancel",   discoveryCtrl::cancel);

        app.get("/api/autocheck/status",    autoCheckCtrl::getStatus);
        app.post("/api/autocheck/start",    autoCheckCtrl::start);
        app.post("/api/autocheck/stop",     autoCheckCtrl::stop);

        app.get("/api/audio/list",          audioCtrl::listSounds);
        app.get("/api/audio/stream",        audioCtrl::streamSound);
        app.post("/api/audio/play",         audioCtrl::playSound);
        app.post("/api/audio/upload",       audioCtrl::uploadSound);

        app.get("/api/settings",            settingsCtrl::getSettings);
        app.put("/api/settings",            settingsCtrl::updateSettings);
        app.put("/api/autocheck/interval",  autoCheckCtrl::setInterval);

        app.get("/api/logs", ctx -> {
            try {
                java.nio.file.Path logFile = Paths.get("sentry.log");
                if (!java.nio.file.Files.exists(logFile)) { ctx.json(new ArrayList<>()); return; }
                List<String> lines = java.nio.file.Files.readAllLines(logFile);
                int limit = 200;
                List<String> recent = new ArrayList<>(
                    lines.size() > limit ? lines.subList(lines.size() - limit, lines.size()) : lines
                );
                Collections.reverse(recent);
                ctx.json(recent);
            } catch (Exception e) { ctx.status(500).result("Failed to read log: " + e.getMessage()); }
        });

        // Back to a fresh install: no targets, history, settings, saved mail password or custom sounds.
        app.post("/api/reset", ctx -> {
            synchronized (targets) {
                targets.clear();
                TargetRepository.saveTargets(targets, TARGETS_FILE);
            }
            autoCheckService.resetState();
            HistoryRepository.clearHistory();
            SettingsRepository.saveSettings(new SettingsRepository.AppSettings());
            SecretStore.put(SecretStore.SMTP_PASSWORD, null);
            AppData.clearAll();
            statusPage.applySettings();
            deleteTree(Paths.get(AudioController.CUSTOM_DIR));
            SentryLogger.info("Application reset: targets, history, settings, maintenance, webhooks, scheduled reports, notes and custom sounds were removed.");
            ctx.status(204);
        });

        app.post("/api/runtime/shutdown", ctx -> {
            ctx.result("Shutting down...");
            SentryLogger.info("Shutdown requested via API.", false);
            new Thread(() -> {
                try { Thread.sleep(300); } catch (InterruptedException ignored) {}
                System.exit(0);
            }).start();
        });
    }

    private static void deleteTree(Path dir) {
        if (!java.nio.file.Files.exists(dir)) return;
        try (java.util.stream.Stream<Path> walk = java.nio.file.Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    java.nio.file.Files.deleteIfExists(p);
                } catch (java.io.IOException e) {
                    SentryLogger.warn("Couldn't delete " + p + ": " + e.getMessage());
                }
            });
        } catch (java.io.IOException e) {
            SentryLogger.warn("Couldn't delete " + dir + ": " + e.getMessage());
        }
    }

    public void start() {
        app.start("127.0.0.1", PORT);
        statusPage.applySettings();
        SentryLogger.info("API server started on http://127.0.0.1:" + PORT, false);
    }

    public void stop() {
        app.stop();
        SentryLogger.info("API server stopped.", false);
    }

    public AutoCheckService getAutoCheckService() { return autoCheckService; }
}