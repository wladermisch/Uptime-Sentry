package com.uptimesentry.api;

import java.util.Locale;
import java.util.Set;

/**
 * Decides which requests the local API answers. The API has no login and can run commands
 * (a target's recovery command), so a web page open in any browser on this computer must not reach it:
 *
 * - Browsers send an Origin header with every cross-site request, including the "simple" POSTs that
 *   skip the CORS preflight. Only the desktop app's own origins are accepted; requests without an
 *   Origin (the Tauri shell, PowerShell, curl, scripts) are not from a web page and are allowed.
 * - The Host header must name this computer's loopback address, which stops DNS rebinding
 *   (a site whose name is pointed at 127.0.0.1 after the page loaded).
 */
public final class LocalAccess {

    /** The desktop window (Tauri on Windows, macOS and Linux), the dev server, and the API's own pages. */
    static final Set<String> ALLOWED_ORIGINS = Set.of(
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:" + ApiServer.PORT,
        "http://localhost:" + ApiServer.PORT
    );

    private static final Set<String> ALLOWED_HOSTS = Set.of(
        "127.0.0.1:" + ApiServer.PORT,
        "localhost:" + ApiServer.PORT,
        "[::1]:" + ApiServer.PORT
    );

    private LocalAccess() {
    }

    public static boolean originAllowed(String origin) {
        return origin == null || ALLOWED_ORIGINS.contains(origin.toLowerCase(Locale.ROOT));
    }

    public static boolean hostAllowed(String host) {
        return host != null && ALLOWED_HOSTS.contains(host.toLowerCase(Locale.ROOT));
    }

    /** Null when the request may go on, else the reason it is refused. */
    public static String refusal(String origin, String host) {
        if (!hostAllowed(host)) return "Refused: the API only answers requests for 127.0.0.1:" + ApiServer.PORT + ".";
        if (!originAllowed(origin)) return "Refused: requests from web pages are not allowed.";
        return null;
    }
}
