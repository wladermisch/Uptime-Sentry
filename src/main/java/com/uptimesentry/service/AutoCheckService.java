package com.uptimesentry.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import com.uptimesentry.model.MaintenanceWindow;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.model.CheckResult;
import com.uptimesentry.monitor.Monitorable;
import com.uptimesentry.monitor.Monitors;
import com.uptimesentry.util.SentryLogger;
import com.uptimesentry.persistence.AppData;
import com.uptimesentry.persistence.HistoryRepository;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class AutoCheckService {

    private int intervalSeconds;
    private volatile boolean running;
    private final List<MonitoredTarget> targets;
    private final NotificationService notificationService;
    private final Map<Integer, Boolean> lastStatusById = new ConcurrentHashMap<>(); // Map to track last known status of each target by ID, used to detect changes and notify only on state changes.
    private final Map<Integer, Integer> consecutiveFailuresById = new ConcurrentHashMap<>(); // Track consecutive check failures for retry thresholds.
    private final Map<Integer, String> firstFailureById = new ConcurrentHashMap<>(); // Timestamp of the first failed check in the current run.
    private final Map<Integer, Integer> slowCountById = new ConcurrentHashMap<>(); // Slow checks in a row.
    private final Map<Integer, String> slowSinceById = new ConcurrentHashMap<>(); // First slow check of the current run.
    private final Map<Integer, Boolean> slowAlertedById = new ConcurrentHashMap<>(); // A SLOW alert went out for this run.
    private final Map<Integer, String> maintenanceById = new ConcurrentHashMap<>(); // Window id while a target is in maintenance.
    private final EmailService emailService = new EmailService();
    private final WebhookService webhookService = new WebhookService();

    private ScheduledExecutorService scheduler; // We keep a reference to the scheduler to be able to shut it down when stopping auto-checks.
    private ScheduledFuture<?> scheduledTask; // We keep a reference to the scheduled task to be able to cancel it when stopping auto-checks.

    // Constructor for AutoCheckService, takes the list of targets to monitor, the interval in seconds for checks, and a notification service for alerts.
    public AutoCheckService(List<MonitoredTarget> targets, int intervalSeconds, NotificationService notificationService) {
        this.targets = targets;
        this.intervalSeconds = Math.max(1, intervalSeconds);
        this.notificationService = notificationService;
    }

    public void setIntervalSeconds(int intervalSeconds) {
        this.intervalSeconds = Math.max(1, intervalSeconds); //If Interval is set to less than 1, we default to 1 second to avoid issues with scheduling tasks at 0 or negative intervals.
    }

    /** Whether the scheduler is currently running checks. */
    public boolean isRunning() {
        return running;
    }

    public int getIntervalSeconds() {
        return intervalSeconds;
    }

    public synchronized void startAutoChecks() { // We synchronize start and stop
        if (running) return;
        SentryLogger.info("Auto-checks started. Interval: " + intervalSeconds + " seconds.", true);
        scheduler = Executors.newSingleThreadScheduledExecutor(); // We use a single-threaded scheduler since we want to run checks sequentially to avoid race conditions
        scheduledTask = scheduler.scheduleAtFixedRate(() -> {
            try {
                if (running) runAutoCheckCycle();
            } catch (Throwable t) {
                SentryLogger.error("Error in auto-check task: " + t.getMessage());
            }
        }, 0, intervalSeconds, TimeUnit.SECONDS);//0 for start right away, then intervalSeconds for the period between checks.
        running = true;
    } 

    public synchronized void stopAutoChecks() {
        if (!running) return;
        running = false;
        SentryLogger.info("Auto-checks stopped.", true);
        if (scheduledTask != null) {
            scheduledTask.cancel(false); // Cancel the scheduled task, but do not interrupt if it's currently running (false). This allows the current check cycle to finish gracefully before stopping further executions.
            scheduledTask = null;
        }
        if (scheduler != null) {
            scheduler.shutdownNow(); // Shutdown scheduler completely after ending auto-checks
            scheduler = null;
        }
    }

    /** Forgets what is known about each target's last state (after a reset, so no stale recovery emails go out). */
    public void resetState() {
        lastStatusById.clear();
        consecutiveFailuresById.clear();
        firstFailureById.clear();
        slowCountById.clear();
        slowSinceById.clear();
        slowAlertedById.clear();
        maintenanceById.clear();
    }

    public void runAutoCheckCycle() {
        List<MonitoredTarget> snapshot; // Avoid ConcurrentModificationException.
        synchronized (this) {
            snapshot = new ArrayList<>(targets);
        }

        for (MonitoredTarget target : snapshot) {
            if (target.isPaused()) continue;
            Monitorable monitor = Monitors.create(target);
            if (monitor == null) continue; // Unknown type.

            boolean online;
            try {
                online = monitor.checkAvailability();
            } catch (Exception e) {
                online = false;
            }
            long responseTime = monitor.getResponseTime();
            String timestamp = LocalDateTime.now().format(TS);
            String detail = monitor.getLastMessage();
            String message = detail != null && !detail.isBlank() ? detail : (online ? "Auto check succeeded." : "Auto check failed.");
            CheckResult result = CheckResult.of(target, timestamp, online, responseTime, message);

            // Planned work: record the check, but send nothing and leave the alert state as it was,
            // so a target still down when the window ends is reported then.
            MaintenanceWindow window = AppData.activeMaintenance(target, LocalDateTime.now());
            trackMaintenance(target, window);
            if (window != null) {
                result.setMaintenance(true);
                HistoryRepository.addResult(result);
                continue;
            }

            Alert alert = evaluate(target, online, responseTime, message, timestamp);
            if (alert != null) result.setAlert(alert.kind());
            HistoryRepository.addResult(result);
            if (alert != null) dispatch(alert, monitor);
        }
    }

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private void trackMaintenance(MonitoredTarget target, MaintenanceWindow window) {
        String was = maintenanceById.get(target.getId());
        if (window != null && !window.id.equals(was)) {
            maintenanceById.put(target.getId(), window.id);
            SentryLogger.info("Maintenance started for " + target.getName() + ": " + (window.title == null || window.title.isBlank() ? window.describe() : window.title));
        } else if (window == null && was != null) {
            maintenanceById.remove(target.getId());
            SentryLogger.info("Maintenance ended for " + target.getName() + "; alerts are back on.");
        }
    }

    /** Updates the target's state with this check and returns the alert it sets off, if any. */
    private Alert evaluate(MonitoredTarget target, boolean online, long responseTime, String message, String timestamp) {
        int targetId = target.getId();
        int limit = target.getConsecutiveFailuresLimit();
        Boolean prevOnline = lastStatusById.get(targetId);

        if (!online) {
            resetSlow(targetId);
            int failures = consecutiveFailuresById.getOrDefault(targetId, 0) + 1;
            consecutiveFailuresById.put(targetId, failures);
            firstFailureById.putIfAbsent(targetId, timestamp);
            String since = firstFailureById.get(targetId);
            if (prevOnline != null && !prevOnline) {
                SentryLogger.warn("Target " + target.getName() + " is still offline. Consecutive failures: " + failures);
                return null;
            }
            if (failures < limit) {
                SentryLogger.info("Target " + target.getName() + " check failed. Fail count: " + failures + "/" + limit);
                return null;
            }
            lastStatusById.put(targetId, false);
            SentryLogger.warn("Target went offline: " + target.getName() + " (alert triggered)");
            return new Alert(Alert.DOWN, target, timestamp, since, millisBetween(since, timestamp), failures, message, responseTime);
        }

        consecutiveFailuresById.put(targetId, 0);
        String downSince = firstFailureById.remove(targetId);
        if (prevOnline == null) {
            SentryLogger.info("Target " + target.getName() + " initial state: ONLINE");
            lastStatusById.put(targetId, true);
        } else if (!prevOnline) {
            lastStatusById.put(targetId, true);
            SentryLogger.info("Target recovered: " + target.getName() + " is back online.");
            String since = downSince != null ? downSince : "unknown";
            return new Alert(Alert.UP, target, timestamp, since, millisBetween(downSince, timestamp), 0, message, responseTime);
        }
        return evaluateSpeed(target, responseTime, message, timestamp);
    }

    /** SLOW after N slow checks in a row, NORMAL on the first fast check after that. */
    private Alert evaluateSpeed(MonitoredTarget target, long responseTime, String message, String timestamp) {
        int targetId = target.getId();
        int after = target.getSlowAlertAfter();
        if (after <= 0) {
            resetSlow(targetId);
            return null;
        }
        boolean slow = responseTime > target.getDegradedLatencyThreshold();
        if (slow) {
            int count = slowCountById.getOrDefault(targetId, 0) + 1;
            slowCountById.put(targetId, count);
            slowSinceById.putIfAbsent(targetId, timestamp);
            if (count >= after && !slowAlertedById.getOrDefault(targetId, false)) {
                slowAlertedById.put(targetId, true);
                String since = slowSinceById.get(targetId);
                SentryLogger.warn("Target " + target.getName() + " is slow: " + responseTime + " ms (limit " + target.getDegradedLatencyThreshold() + " ms)");
                return new Alert(Alert.SLOW, target, timestamp, since, millisBetween(since, timestamp), count, message, responseTime);
            }
            return null;
        }
        boolean alerted = slowAlertedById.getOrDefault(targetId, false);
        String since = slowSinceById.get(targetId);
        resetSlow(targetId);
        if (!alerted) return null;
        SentryLogger.info("Target " + target.getName() + " is responding normally again (" + responseTime + " ms).");
        return new Alert(Alert.NORMAL, target, timestamp, since, millisBetween(since, timestamp), 0, message, responseTime);
    }

    private void resetSlow(int targetId) {
        slowCountById.remove(targetId);
        slowSinceById.remove(targetId);
        slowAlertedById.remove(targetId);
    }

    /** Sends the alert to every channel: tray and sound, email, webhooks; runs the recovery command on DOWN. */
    private void dispatch(Alert alert, Monitorable monitor) {
        MonitoredTarget target = alert.target();
        switch (alert.kind()) {
            case Alert.DOWN -> {
                if (notificationService != null) notificationService.notifyFailure(target);
                emailService.sendDown(target, new EmailService.Outage(alert.since(), alert.time(), alert.durationMs(),
                    alert.checks(), alert.message(), alert.responseMs()));
                try {
                    monitor.executeRecovery();
                } catch (Exception e) {
                    SentryLogger.error("Recovery command failed: " + e.getMessage());
                }
            }
            case Alert.UP -> {
                if (notificationService != null) notificationService.notifyRecovery(target);
                emailService.sendRecovery(target, new EmailService.Outage(alert.since(), alert.time(), alert.durationMs(),
                    0, alert.message(), alert.responseMs()));
            }
            default -> {
                if (notificationService != null) notificationService.notifySpeed(alert);
                emailService.sendSlowness(alert);
            }
        }
        webhookService.send(alert);
    }

    private static long millisBetween(String from, String to) {
        if (from == null || to == null) return 0;
        try {
            DateTimeFormatter f = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            return java.time.Duration.between(LocalDateTime.parse(from, f), LocalDateTime.parse(to, f)).toMillis();
        } catch (RuntimeException e) {
            return 0;
        }
    }
}
