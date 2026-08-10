package com.uptimesentry.persistence;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

public class SettingsRepository {
    private static final Path SETTINGS_FILE = Paths.get("settings.json");

    public static class AppSettings {
        public float volume = 0.8f;
        public boolean playSoundAlert = true;
    }

    private static AppSettings cachedSettings = null;

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
            Gson gson = new Gson();
            cachedSettings = gson.fromJson(json, AppSettings.class);
            if (cachedSettings == null) {
                cachedSettings = new AppSettings();
            }
            return cachedSettings;
        } catch (IOException e) {
            cachedSettings = new AppSettings();
            return cachedSettings;
        }
    }

    public static synchronized void saveSettings(AppSettings settings) {
        cachedSettings = settings;
        try {
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            String json = gson.toJson(settings);
            Files.writeString(SETTINGS_FILE, json, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            System.err.println("Failed to save settings: " + e.getMessage());
        }
    }
}
