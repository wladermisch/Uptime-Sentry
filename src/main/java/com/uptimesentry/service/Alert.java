package com.uptimesentry.service;

import com.uptimesentry.model.MonitoredTarget;

/**
 * One alert about a target, handed to every channel (tray, sound, email, webhooks).
 *
 * @param kind        DOWN, UP (recovered), SLOW (responding slowly) or NORMAL (fast again)
 * @param time        when the check that set it off ran, "yyyy-MM-dd HH:mm:ss"
 * @param since       when the state began (first failed or slow check)
 * @param durationMs  how long the previous state lasted (UP, NORMAL) or has lasted so far
 * @param checks      failed or slow checks in a row
 * @param responseMs  the check's response time, or -1
 */
public record Alert(String kind, MonitoredTarget target, String time, String since, long durationMs,
                    int checks, String message, long responseMs) {

    public static final String DOWN = "DOWN";
    public static final String UP = "UP";
    public static final String SLOW = "SLOW";
    public static final String NORMAL = "NORMAL";

    /** "Shop API is down", "… is slow" and so on. */
    public String headline() {
        String name = target.getName();
        return switch (kind) {
            case DOWN -> name + " is down";
            case UP -> name + " is back up";
            case SLOW -> name + " is responding slowly";
            default -> name + " is responding normally again";
        };
    }

    /** A few plain lines for chat messages and notifications. */
    public String details() {
        StringBuilder sb = new StringBuilder();
        if (message != null && !message.isBlank()) sb.append(message).append('\n');
        switch (kind) {
            case DOWN -> sb.append("Down since ").append(since).append(" · ").append(checks).append(checks == 1 ? " failed check" : " failed checks");
            case UP -> sb.append("Was down for ").append(EmailService.formatDuration(durationMs)).append(" (since ").append(since).append(')');
            case SLOW -> sb.append(responseMs).append(" ms, over the ").append(target.getDegradedLatencyThreshold())
                .append(" ms limit for ").append(checks).append(checks == 1 ? " check" : " checks in a row");
            default -> sb.append("Slow for ").append(EmailService.formatDuration(durationMs)).append(", now ").append(responseMs).append(" ms");
        }
        return sb.toString();
    }
}
