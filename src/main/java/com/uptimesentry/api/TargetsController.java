package com.uptimesentry.api;

import com.uptimesentry.model.CheckResult;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.monitor.HttpMonitor;
import com.uptimesentry.monitor.Monitorable;
import com.uptimesentry.monitor.PingMonitor;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.persistence.TargetRepository;
import com.uptimesentry.service.AutoCheckService;
import com.uptimesentry.util.SentryLogger;

import io.javalin.http.Context;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

/**
 * TargetsController handles all REST endpoints for monitored targets.
 */
public class TargetsController {

    private final List<MonitoredTarget> targets;
    private final Path targetsFile;
    private final AutoCheckService autoCheckService;

    public TargetsController(List<MonitoredTarget> targets, Path targetsFile, AutoCheckService autoCheckService) {
        this.targets = targets;
        this.targetsFile = targetsFile;
        this.autoCheckService = autoCheckService;
    }

    /** GET /api/targets */
    public void getAll(Context ctx) {
        ctx.json(targets);
    }

    /** POST /api/targets */
    public void add(Context ctx) {
        try {
            MonitoredTarget t = ctx.bodyAsClass(MonitoredTarget.class);
            int nextId = targets.stream().mapToInt(MonitoredTarget::getId).max().orElse(0) + 1;
            t.setId(nextId);
            if (t.getName() == null || t.getName().isBlank()) { ctx.status(400).result("name is required"); return; }
            if (t.getHost() == null || t.getHost().isBlank()) { ctx.status(400).result("host is required"); return; }
            if (t.getType() == null || (!t.getType().equalsIgnoreCase("HTTP") && !t.getType().equalsIgnoreCase("PING"))) {
                ctx.status(400).result("type must be HTTP or PING"); return;
            }
            if (t.getTimeout() <= 0) t.setTimeout(5);
            synchronized (targets) {
                targets.add(t);
                TargetRepository.saveTargets(targets, targetsFile);
            }
            SentryLogger.info("Target added via API: " + t.getName(), false);
            ctx.status(201).json(t);
        } catch (Exception e) {
            ctx.status(500).result("Failed to add target: " + e.getMessage());
        }
    }

    /** PUT /api/targets/{id} */
    public void edit(Context ctx) {
        int id;
        try { id = Integer.parseInt(ctx.pathParam("id")); }
        catch (NumberFormatException e) { ctx.status(400).result("invalid id"); return; }
        synchronized (targets) {
            Optional<MonitoredTarget> opt = targets.stream().filter(t -> t.getId() == id).findFirst();
            if (opt.isEmpty()) { ctx.status(404).result("target not found"); return; }
            MonitoredTarget existing = opt.get();
            try {
                MonitoredTarget patch = ctx.bodyAsClass(MonitoredTarget.class);
                if (patch.getName() != null && !patch.getName().isBlank()) existing.setName(patch.getName());
                if (patch.getHost() != null && !patch.getHost().isBlank()) existing.setHost(patch.getHost());
                if (patch.getType() != null && !patch.getType().isBlank()) existing.setType(patch.getType());
                if (patch.getTimeout() > 0) existing.setTimeout(patch.getTimeout());
                if (patch.getRecoveryAction() != null) existing.setRecoveryAction(patch.getRecoveryAction());
                if (patch.getAcceptableStatusCodes() != null) existing.setAcceptableStatusCodes(patch.getAcceptableStatusCodes());
                if (patch.getConsecutiveFailuresLimit() > 0) existing.setConsecutiveFailuresLimit(patch.getConsecutiveFailuresLimit());
                TargetRepository.saveTargets(targets, targetsFile);
                SentryLogger.info("Target edited via API: " + existing.getName(), false);
                ctx.json(existing);
            } catch (Exception e) { ctx.status(500).result("Failed to edit: " + e.getMessage()); }
        }
    }

    /** DELETE /api/targets/{id} */
    public void remove(Context ctx) {
        int id;
        try { id = Integer.parseInt(ctx.pathParam("id")); }
        catch (NumberFormatException e) { ctx.status(400).result("invalid id"); return; }
        synchronized (targets) {
            boolean removed = targets.removeIf(t -> t.getId() == id);
            if (!removed) { ctx.status(404).result("target not found"); return; }
            try {
                TargetRepository.saveTargets(targets, targetsFile);
                SentryLogger.info("Target removed via API. ID: " + id, false);
                ctx.status(204);
            } catch (Exception e) { ctx.status(500).result("Failed to save: " + e.getMessage()); }
        }
    }

    /** PUT /api/targets */
    public void syncAll(Context ctx) {
        try {
            MonitoredTarget[] list = ctx.bodyAsClass(MonitoredTarget[].class);
            synchronized (targets) {
                targets.clear();
                for (MonitoredTarget t : list) {
                    targets.add(t);
                }
                TargetRepository.saveTargets(targets, targetsFile);
            }
            SentryLogger.info("Targets list synchronized via API (" + list.length + " targets)", false);
            ctx.status(200).json(targets);
        } catch (Exception e) {
            ctx.status(500).result("Failed to sync targets: " + e.getMessage());
        }
    }

    /** POST /api/targets/check-dryrun */
    public void checkDryRun(Context ctx) {
        try {
            MonitoredTarget target = ctx.bodyAsClass(MonitoredTarget.class);
            if (target.getHost() == null || target.getHost().isBlank()) {
                ctx.status(400).result("host is required");
                return;
            }
            if (target.getType() == null) target.setType("HTTP");
            if (target.getTimeout() <= 0) target.setTimeout(5);

            String type = target.getType();
            boolean online = false;
            long responseTime = 0;
            String message = "";

            long startTime = System.currentTimeMillis();
            if ("HTTP".equalsIgnoreCase(type)) {
                try {
                    java.net.HttpURLConnection connection = (java.net.HttpURLConnection) new java.net.URL(target.getHost()).openConnection();
                    connection.setConnectTimeout(target.getTimeout() * 1000);
                    connection.setReadTimeout(target.getTimeout() * 1000);
                    int responseCode = connection.getResponseCode();
                    if (target.getAcceptableStatusCodes() == null || target.getAcceptableStatusCodes().isEmpty()) {
                        online = (responseCode == 200);
                    } else {
                        online = target.getAcceptableStatusCodes().contains(responseCode);
                    }
                    message = "HTTP " + responseCode;
                } catch (Exception e) {
                    online = false;
                    message = "Connection failed: " + e.getMessage();
                }
            } else {
                try {
                    boolean reachable = java.net.InetAddress.getByName(target.getHost()).isReachable(target.getTimeout() * 1000);
                    online = reachable;
                    message = reachable ? "Ping success" : "Ping timeout";
                } catch (Exception e) {
                    online = false;
                    message = "Ping failed: " + e.getMessage();
                }
            }
            long endTime = System.currentTimeMillis();
            responseTime = endTime - startTime;

            ctx.json(new CheckResult(
                0,
                target.getName() != null ? target.getName() : "Dry Run",
                java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                online,
                responseTime,
                message
            ));
        } catch (Exception e) {
            ctx.status(500).result("Dry-run failed: " + e.getMessage());
        }
    }

    /** POST /api/targets/{id}/check */
    public void checkOne(Context ctx) {
        int id;
        try { id = Integer.parseInt(ctx.pathParam("id")); }
        catch (NumberFormatException e) { ctx.status(400).result("invalid id"); return; }
        Optional<MonitoredTarget> opt;
        synchronized (targets) { opt = targets.stream().filter(t -> t.getId() == id).findFirst(); }
        if (opt.isEmpty()) { ctx.status(404).result("target not found"); return; }
        MonitoredTarget target = opt.get();
        Monitorable monitor = "HTTP".equalsIgnoreCase(target.getType())
            ? new HttpMonitor(target) : new PingMonitor(target);
        boolean online;
        try { online = monitor.checkAvailability(); } catch (Exception e) { online = false; }
        long responseTime = monitor.getResponseTime();
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        CheckResult result = new CheckResult(target.getId(), target.getName(), timestamp, online, responseTime,
            online ? "Manual check succeeded." : "Manual check failed.");
        HistoryRepository.addResult(result);
        ctx.json(result);
    }
}