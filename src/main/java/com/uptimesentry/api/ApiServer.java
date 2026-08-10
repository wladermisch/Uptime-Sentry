package com.uptimesentry.api;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.persistence.TargetRepository;
import com.uptimesentry.service.AutoCheckService;
import com.uptimesentry.service.NotificationService;
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

    public ApiServer() throws Exception {
        this.targets = TargetRepository.loadTargets(TARGETS_FILE);
        NotificationService notificationService = new NotificationService();
        this.autoCheckService = new AutoCheckService(targets, 60, notificationService);
        this.autoCheckService.startAutoChecks();

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

        app.get("/api/targets",             targetsCtrl::getAll);
        app.post("/api/targets",            targetsCtrl::add);
        app.put("/api/targets",             targetsCtrl::syncAll);
        app.put("/api/targets/{id}",        targetsCtrl::edit);
        app.delete("/api/targets/{id}",     targetsCtrl::remove);
        app.post("/api/targets/{id}/check", targetsCtrl::checkOne);
        app.post("/api/targets/check-dryrun", targetsCtrl::checkDryRun);

        app.get("/api/history",             historyCtrl::getHistory);
        app.delete("/api/history",          historyCtrl::clearHistory);

        app.get("/api/autocheck/status",    autoCheckCtrl::getStatus);
        app.post("/api/autocheck/start",    autoCheckCtrl::start);
        app.post("/api/autocheck/stop",     autoCheckCtrl::stop);

        app.get("/api/audio/list",          audioCtrl::listSounds);
        app.get("/api/audio/stream",        audioCtrl::streamSound);
        app.post("/api/audio/play",         audioCtrl::playSound);

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

        app.post("/api/runtime/shutdown", ctx -> {
            ctx.result("Shutting down...");
            SentryLogger.info("Shutdown requested via API.", false);
            new Thread(() -> {
                try { Thread.sleep(300); } catch (InterruptedException ignored) {}
                System.exit(0);
            }).start();
        });
    }

    public void start() {
        app.start("127.0.0.1", PORT);
        SentryLogger.info("API server started on http://127.0.0.1:" + PORT, false);
    }

    public void stop() {
        app.stop();
        SentryLogger.info("API server stopped.", false);
    }

    public AutoCheckService getAutoCheckService() { return autoCheckService; }
}