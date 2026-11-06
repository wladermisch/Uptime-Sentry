package com.uptimesentry.persistence;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;

public class SettingsRepository {
    private static final Path SETTINGS_FILE = Paths.get("settings.json");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static class AppSettings {
        public float volume = 0.8f;
        public boolean playSoundAlert = true;
        /** Tray notifications when a target goes down or recovers. */
        public boolean desktopNotifications = true;
        /** Check results older than this many days are deleted. */
        public int historyRetentionDays = 30;

        // Outgoing mail server used for outage emails.
        public String smtpHost = "";
        public int smtpPort = 587;
        /** STARTTLS, SSL or NONE. */
        public String smtpSecurity = "STARTTLS";
        public String smtpUsername = "";
        /**
         * Never written to settings.json: the password lives in {@link SecretStore}. Only read here to move
         * a password saved by an older version out of the file, and used in memory for unsaved test sends.
         */
        public String smtpPassword;
        public String smtpFrom = "";
        public String smtpFromName = "Uptime Sentry";

        // Read-only status page, served at http://127.0.0.1:8765/status.
        public boolean statusPageEnabled = false;
        public String statusPageTitle = "Service status";
        /** Show each target's address (off: names only). */
        public boolean statusPageShowHosts = false;
        /** Also serve the page to other devices on the network, on its own port (never the API). */
        public boolean statusPageNetwork = false;
        public int statusPagePort = 8766;
        /** Profiles to show; empty shows all monitored targets. */
        public java.util.List<String> statusPageProfileIds = new java.util.ArrayList<>();

        public AppSettings copy() {
            return GSON.fromJson(GSON.toJson(this), AppSettings.class);
        }
    }

    private static AppSettings cachedSettings = null;

    private SettingsRepository() {
    }

    public static synchronized AppSettings loadSettings() {
        if (cachedSettings != null) {
            return cachedSettings;
        }
        if (!Files.exists(SETTINGS_FILE)) {
            cachedSettings = new AppSettings();
            saveSettings(cachedSettings);
            return cachedSettings;
        }
        try {
            String json = Files.readString(SETTINGS_FILE);
            cachedSettings = GSON.fromJson(json, AppSettings.class);
            if (cachedSettings == null) {
                cachedSettings = new AppSettings();
            }
            migratePlainTextPassword(cachedSettings);
            return cachedSettings;
        } catch (IOException | JsonParseException e) {
            cachedSettings = new AppSettings();
            return cachedSettings;
        }
    }

    /** Older versions saved the SMTP password in settings.json; move it to the credential store and drop it from the file. */
    private static void migratePlainTextPassword(AppSettings s) {
        if (s.smtpPassword == null) return;
        if (!s.smtpPassword.isEmpty()) {
            SecretStore.put(SecretStore.SMTP_PASSWORD, s.smtpPassword);
            com.uptimesentry.util.SentryLogger.info("Moved the mail password from settings.json to the system credential store.");
        }
        s.smtpPassword = null;
        saveSettings(s);
    }

    public static synchronized void saveSettings(AppSettings settings) {
        settings.smtpPassword = null; // Secrets never go into the file (see SecretStore).
        cachedSettings = settings;
        try {
            Files.writeString(SETTINGS_FILE, GSON.toJson(settings), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            System.err.println("Failed to save settings: " + e.getMessage());
        }
    }
}
