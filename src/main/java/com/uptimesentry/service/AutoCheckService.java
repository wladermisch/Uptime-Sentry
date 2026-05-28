package com.uptimesentry.service;

import java.util.List;

import com.uptimesentry.model.MonitoredTarget;

public class AutoCheckService {

    private int intervalSeconds;
    private boolean running;
    private List<MonitoredTarget> targets;
    private NotificationService notificationService;

    public AutoCheckService(List<MonitoredTarget> targets, int intervalSeconds, NotificationService notificationService) {
        this.targets = targets;
        this.intervalSeconds = intervalSeconds;
        this.notificationService = notificationService;
    }

    public void setIntervalSeconds(int intervalSeconds) {
        this.intervalSeconds = intervalSeconds;
    }

    public void startAutoChecks() {
        this.running = true;
    }

    public void stopAutoChecks() {
        this.running = false;
    }

    public void runAutoCheckCycle() {
        for (MonitoredTarget target : targets) {
            Monitorable monitor;
            if (target.getType().equalsIgnoreCase("HTTP")) {
                monitor = new com.uptimesentry.monitor.HttpMonitor(target);
            } else if (target.getType().equalsIgnoreCase("PING")) {
                monitor = new com.uptimesentry.monitor.PingMonitor(target);
            } else {
                System.out.println("Unknown target type for " + target.getName() + ", skipping.");
                continue;
            }
            boolean online = monitor.checkAvailability();
            long responseTime = monitor.getResponseTime();

            System.out.printf("Auto-check: Target %s is %s (Response Time: %d ms)%n",
                target.getName(),
                online ? "ONLINE" : "OFFLINE",
                responseTime);
        }
    }
}