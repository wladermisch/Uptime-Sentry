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
import com.uptimesentry.monitor.HttpMonitor;
import com.uptimesentry.monitor.Monitorable;
import com.uptimesentry.monitor.PingMonitor;

public class AutoCheckService {

    private int intervalSeconds;
    private volatile boolean running;
    private final List<MonitoredTarget> targets;
    private final NotificationService notificationService;
    private final Map<Integer, Boolean> lastStatusById = new ConcurrentHashMap<>(); // Map to track last known status of each target by ID, used to detect changes and notify only on state changes.

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
        scheduler = Executors.newSingleThreadScheduledExecutor(); // We use a single-threaded scheduler since we want to run checks sequentially to avoid race conditions
        scheduledTask = scheduler.scheduleAtFixedRate(() -> {
            try {
                if (running) runAutoCheckCycle();
            } catch (Throwable t) {
                // keep scheduler alive on unexpected errors
            }
        }, 0, intervalSeconds, TimeUnit.SECONDS);//0 for start right away, then intervalSeconds for the period between checks.
        running = true;
    } 

    public synchronized void stopAutoChecks() {
        if (!running) return;
        running = false;
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

            Boolean prev = lastStatusById.get(target.getId());
            if (prev == null) {
                lastStatusById.put(target.getId(), online);
                continue;
            }

            if (prev != online) {
                // state changed -> notify once
                if (notificationService != null) {
                    if (online) {
                        notificationService.notifyRecovery(target);
                    } else {
                        notificationService.notifyFailure(target);
                        try {
                            monitor.executeRecovery();
                        } catch (Exception e) {
                            System.out.println("Recovery command failed: " + e.getMessage());
                        }
                    }
                }
                lastStatusById.put(target.getId(), online);
            }
            // no change -> do nothing
        }
    }
}
