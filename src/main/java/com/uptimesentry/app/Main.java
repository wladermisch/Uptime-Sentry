package com.uptimesentry.app;

import com.uptimesentry.api.ApiServer;
import com.uptimesentry.util.SentryLogger;

import java.util.Arrays;

/**
 * Main is the application entry point.
 *
 * Modes:
 *   (default / --no-gui)  Start the interactive console menu (terminal use).
 *   --api                 Start the Javalin REST API server on port 8765.
 *                         This is the mode used by the Tauri desktop shell.
 */
public class Main {

    public static void main(String[] args) {
        boolean apiMode = Arrays.asList(args).contains("--api");

        if (apiMode) {
            // --- API mode: serve REST endpoints for the Tauri / React frontend ---
            SentryLogger.info("Uptime-Sentry starting in API mode...", false);
            try {
                ApiServer server = new ApiServer();
                // Register shutdown hook so Ctrl-C also cleans up
                Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
                server.start();
                // Block the main thread — Javalin runs on Jetty background threads
                Thread.currentThread().join();
            } catch (Exception e) {
                SentryLogger.error("Failed to start API server: " + e.getMessage());
                System.exit(1);
            }
        } else {
            // --- Console / no-gui mode: interactive terminal menu ---
            SentryLogger.info("Uptime-Sentry starting...", false);

            System.out.println("========================================");
            System.out.println("     Welcome to Uptime-Sentry");
            System.out.println("========================================");
            System.out.println();

            ConsoleMenu menu = new ConsoleMenu();
            try {
                menu.loop();
            } finally {
                menu.close();
                System.out.println("\nGoodbye!");
                SentryLogger.info("Uptime-Sentry stopped.", false);
            }
        }
    }
}
