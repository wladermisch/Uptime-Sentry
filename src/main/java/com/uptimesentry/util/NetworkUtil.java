package com.uptimesentry.util;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.TimeUnit;

public class NetworkUtil {

    public static String cleanPingHost(String rawHost) {
        if (rawHost == null) return "";
        String h = rawHost.trim();
        if (h.toLowerCase().startsWith("http://")) h = h.substring(7);
        if (h.toLowerCase().startsWith("https://")) h = h.substring(8);
        int slash = h.indexOf('/');
        if (slash != -1) h = h.substring(0, slash);
        int colon = h.indexOf(':');
        if (colon != -1) h = h.substring(0, colon);
        return h.trim();
    }

    public static String normalizeHttpUrl(String rawUrl) {
        if (rawUrl == null) return "";
        String u = rawUrl.trim();
        if (!u.toLowerCase().startsWith("http://") && !u.toLowerCase().startsWith("https://")) {
            u = "https://" + u;
        }
        return u;
    }

    public static boolean ping(String rawHost, int timeoutSeconds) {
        String host = cleanPingHost(rawHost);
        if (host.isBlank()) return false;
        int timeoutMs = Math.max(1, timeoutSeconds) * 1000;

        // 1. Try Java's built-in isReachable (works on Linux/macOS or if run as admin on Windows)
        try {
            InetAddress address = InetAddress.getByName(host);
            if (address.isReachable(timeoutMs)) {
                return true;
            }
        } catch (Exception ignored) {
        }

        // 2. Fallback to OS system ping utility (works on Windows without raw socket/admin privileges)
        try {
            boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");
            ProcessBuilder pb;
            if (isWindows) {
                // ping -n 1 -w <ms> <host>
                pb = new ProcessBuilder("ping", "-n", "1", "-w", String.valueOf(timeoutMs), host);
            } else {
                int sec = Math.max(1, timeoutSeconds);
                pb = new ProcessBuilder("ping", "-c", "1", "-W", String.valueOf(sec), host);
            }
            pb.redirectErrorStream(true);
            Process process = pb.start();
            boolean finished = process.waitFor(timeoutMs + 1500, TimeUnit.MILLISECONDS);
            if (finished && process.exitValue() == 0) {
                return true;
            }
            if (!finished) {
                process.destroyForcibly();
            }
        } catch (Exception ignored) {
        }

        // 3. Fallback to TCP socket connection on common ports (80 HTTP, 443 HTTPS, 53 DNS)
        int[] ports = {80, 443, 53};
        for (int port : ports) {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), Math.min(timeoutMs, 2000));
                return true;
            } catch (Exception ignored) {
            }
        }

        return false;
    }
}
