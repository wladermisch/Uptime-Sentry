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
    private List<MonitoredTarget> targets;
    private NotificationService notificationService;
    private Map<Integer, Boolean> lastStatusById = new ConcurrentHashMap<>();

    private ScheduledExecutorService scheduler;
    private ScheduledFuture<?> scheduledTask;

    public AutoCheckService(List<MonitoredTarget> targets, int intervalSeconds, NotificationService notificationService) {
        this.targets = targets;
        this.intervalSeconds = Math.max(1, intervalSeconds);
        this.notificationService = notificationService;
    }

    public void setIntervalSeconds(int intervalSeconds) {
        this.intervalSeconds = Math.max(1, intervalSeconds);
    }

    public synchronized void startAutoChecks() {
        if (running) return;
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduledTask = scheduler.scheduleAtFixedRate(() -> {
            try {
                if (running) runAutoCheckCycle();
            } catch (Throwable t) {
                // keep scheduler alive on unexpected errors
            }
        }, 0, intervalSeconds, TimeUnit.SECONDS);
        running = true;
    }

    public synchronized void stopAutoChecks() {
        if (!running) return;
        running = false;
        if (scheduledTask != null) {
            scheduledTask.cancel(false);
            scheduledTask = null;
        }
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
    }

    public void runAutoCheckCycle() {
        List<MonitoredTarget> snapshot;
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
                    }
                }
                lastStatusById.put(target.getId(), online);
            }
            // no change -> do nothing
        }
    }
}