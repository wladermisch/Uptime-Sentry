package com.uptimesentry.model;

import java.util.ArrayList;
import java.util.List;

/** An address that gets a POST when targets change state. */
public class Webhook {

    public String id;
    public String name = "";
    public String url = "";
    /** GENERIC (JSON), SLACK, DISCORD, TEAMS or NTFY. */
    public String format = "GENERIC";
    public boolean enabled = true;
    /** Which alerts to send: DOWN, UP, SLOW, NORMAL. */
    public List<String> events = new ArrayList<>(List.of("DOWN", "UP"));
    /** Empty means every profile. */
    public List<String> profileIds = new ArrayList<>();

    public boolean wants(String event, MonitoredTarget target) {
        if (!enabled || url == null || url.isBlank()) return false;
        if (events == null || !events.contains(event)) return false;
        return profileIds == null || profileIds.isEmpty() || (target != null && profileIds.contains(target.getProfileId()));
    }
}
