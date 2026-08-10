package com.uptimesentry.api;

import io.javalin.http.Context;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.SettingsRepository.AppSettings;

public class SettingsController {

    public void getSettings(Context ctx) {
        ctx.json(SettingsRepository.loadSettings());
    }

    public void updateSettings(Context ctx) {
        try {
            AppSettings req = ctx.bodyAsClass(AppSettings.class);
            SettingsRepository.saveSettings(req);
            ctx.status(200).json(req);
        } catch (Exception e) {
            ctx.status(400).result("Invalid settings format: " + e.getMessage());
        }
    }
}
