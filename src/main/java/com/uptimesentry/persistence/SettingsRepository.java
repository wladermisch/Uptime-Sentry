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
        public String smtpPassword = "";
        public String smtpFrom = "";
        public String smtpFromName = "Uptime Sentry";

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
            return cachedSettings;
        } catch (IOException | JsonParseException e) {
            cachedSettings = new AppSettings();
            return cachedSettings;
        }
    }

    public static synchronized void saveSettings(AppSettings settings) {
        cachedSettings = settings;
        try {
            Files.writeString(SETTINGS_FILE, GSON.toJson(settings), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            System.err.println("Failed to save settings: " + e.getMessage());
        }
    }
}
