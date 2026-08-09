package com.uptimesentry.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.model.CheckResult;
import com.uptimesentry.monitor.HttpMonitor;
import com.uptimesentry.monitor.Monitorable;
import com.uptimesentry.monitor.PingMonitor;
import com.uptimesentry.util.SentryLogger;
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

    public void runAutoCheckCycle() {
        List<MonitoredTarget> snapshot; // Avoid ConcurrentModificationException.
        synchronized (this) {
            snapshot = new ArrayList<>(targets);
        }

        for (MonitoredTarget target : snapshot) {
            Monitorable monitor;
            String type = target.getType();
            if ("HTTP".equalsIgnoreCase(type)) {
                monitor = new HttpMonitor(target);
            } else if ("PING".equalsIgnoreCase(type)) {
                monitor = new PingMonitor(target);
            } else {
                continue; //unknown type, skipped (for more types later)
            }

            boolean online;
            try {
                online = monitor.checkAvailability();
            } catch (Exception e) {
                online = false;
            }
            long responseTime = monitor.getResponseTime();

            // Record check result in history
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            CheckResult result = new CheckResult(
                target.getId(),
                target.getName(),
                timestamp,
                online,
                responseTime,
                online ? "Auto check succeeded." : "Auto check failed."
            );
            HistoryRepository.addResult(result);

            int targetId = target.getId();
            int limit = target.getConsecutiveFailuresLimit();
            Boolean prevOnline = lastStatusById.get(targetId);

            if (online) {
                consecutiveFailuresById.put(targetId, 0); // Reset count
                if (prevOnline == null) {
                    SentryLogger.info("Target " + target.getName() + " initial state: ONLINE");
                    lastStatusById.put(targetId, true);
                } else if (!prevOnline) {
                    if (notificationService != null) {
                        notificationService.notifyRecovery(target);
                    }
                    SentryLogger.info("Target recovered: " + target.getName() + " is back online.");
                    lastStatusById.put(targetId, true);
                }
            } else {
                int consecutiveFailures = consecutiveFailuresById.getOrDefault(targetId, 0) + 1;
                consecutiveFailuresById.put(targetId, consecutiveFailures);

                if (prevOnline == null) {
                    if (consecutiveFailures >= limit) {
                        if (notificationService != null) {
                            notificationService.notifyFailure(target);
                        }
                        SentryLogger.warn("Target " + target.getName() + " initial state: OFFLINE (alert triggered)");
                        try {
                            monitor.executeRecovery();
                        } catch (Exception e) {
                            SentryLogger.error("Recovery command failed: " + e.getMessage());
                        }
                        lastStatusById.put(targetId, false);
                    } else {
                        SentryLogger.info("Target " + target.getName() + " initial check failed. Fail count: " + consecutiveFailures + "/" + limit);
                    }
                } else if (prevOnline) {
                    if (consecutiveFailures >= limit) {
                        if (notificationService != null) {
                            notificationService.notifyFailure(target);
                        }
                        SentryLogger.warn("Target went offline: " + target.getName() + " (alert triggered)");
                        try {
                            monitor.executeRecovery();
                        } catch (Exception e) {
                            SentryLogger.error("Recovery command failed: " + e.getMessage());
                        }
                        lastStatusById.put(targetId, false);
                    } else {
                        SentryLogger.info("Target " + target.getName() + " check failed. Fail count: " + consecutiveFailures + "/" + limit);
                    }
                } else {
                    // Already offline and notified
                    SentryLogger.warn("Target " + target.getName() + " is still offline. Consecutive failures: " + consecutiveFailures);
                }
            }
        }
    }
}
