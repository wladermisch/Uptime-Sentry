package com.uptimesentry.monitor;

import java.net.URI;

import com.uptimesentry.model.MonitoredTarget;

/** Picks the check for a target's type and holds helpers the checks share. */
public final class Monitors {

    public static final String HTTP = "HTTP";
    public static final String PING = "PING";
    public static final String TCP = "TCP";
    public static final String DNS = "DNS";
    public static final String SSL = "SSL";

    private Monitors() {
    }

    /** The check for this target, or null for an unknown type. */
    public static Monitorable create(MonitoredTarget target) {
        String type = target.getType() == null ? HTTP : target.getType().toUpperCase();
        return switch (type) {
            case HTTP -> new HttpMonitor(target);
            case PING -> new PingMonitor(target);
            case TCP -> new TcpMonitor(target);
            case DNS -> new DnsMonitor(target);
            case SSL -> new SslMonitor(target);
            default -> null;
        };
    }

    public static boolean isKnownType(String type) {
        if (type == null) return false;
        return switch (type.toUpperCase()) {
            case HTTP, PING, TCP, DNS, SSL -> true;
            default -> false;
        };
    }

    /** Host name only, from "host", "host:port" or a URL such as "https://host:8443/path". */
    static String hostOf(String raw) {
        if (raw == null) return "";
        String v = raw.trim();
        if (v.contains("://")) {
            try {
                String h = URI.create(v).getHost();
                if (h != null) return h;
            } catch (IllegalArgumentException ignored) {
                // Fall through to the plain parsing below.
            }
            v = v.substring(v.indexOf("://") + 3);
        }
        int slash = v.indexOf('/');
        if (slash >= 0) v = v.substring(0, slash);
        if (v.startsWith("[")) {
            int close = v.indexOf(']');
            return close > 0 ? v.substring(1, close) : v;
        }
        int colon = v.lastIndexOf(':');
        if (colon > 0 && v.indexOf(':') == colon) v = v.substring(0, colon);
        return v;
    }

    /** The target's port field, else a port in the host text, else {@code fallback}. */
    static int portOf(MonitoredTarget t, int fallback) {
        if (t.getPort() > 0 && t.getPort() <= 65535) return t.getPort();
        String v = t.getHost() == null ? "" : t.getHost().trim();
        try {
            if (v.contains("://")) {
                int p = URI.create(v).getPort();
                if (p > 0) return p;
                return v.toLowerCase().startsWith("http://") ? 80 : fallback;
            }
        } catch (IllegalArgumentException ignored) {
            // Use the plain parsing below.
        }
        int slash = v.indexOf('/');
        if (slash >= 0) v = v.substring(0, slash);
        int colon = v.lastIndexOf(':');
        if (colon > 0 && (v.indexOf(':') == colon || v.contains("]:"))) {
            try {
                int p = Integer.parseInt(v.substring(colon + 1));
                if (p > 0 && p <= 65535) return p;
            } catch (NumberFormatException ignored) {
                // Not a port.
            }
        }
        return fallback;
    }

    /** Runs the target's recovery command (Windows only), as the HTTP and ping checks do. */
    static void runRecovery(MonitoredTarget target) {
        String action = target.getRecoveryAction();
        if (action == null || action.isBlank()) return;
        if (!System.getProperty("os.name").toLowerCase().contains("win")) return;
        try {
            Process p = new ProcessBuilder("cmd", "/c", action).inheritIO().start();
            int exit = p.waitFor();
            if (exit != 0) System.out.println("Recovery command exited with code " + exit);
        } catch (Exception e) {
            System.out.println("Failed to execute recovery action: " + e.getMessage());
        }
    }
}
