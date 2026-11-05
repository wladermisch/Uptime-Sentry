package com.uptimesentry.api;

import io.javalin.http.Context;

import java.util.LinkedHashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.SettingsRepository.AppSettings;

public class SettingsController {

    private static final ObjectMapper MAPPER = new ObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /** GET /api/settings. The mail password is never sent back; smtpPasswordSet says whether one is stored. */
    public void getSettings(Context ctx) {
        AppSettings s = SettingsRepository.loadSettings();
        @SuppressWarnings("unchecked")
        Map<String, Object> out = new LinkedHashMap<>(MAPPER.convertValue(s, Map.class));
        out.remove("smtpPassword");
        out.put("smtpPasswordSet", s.smtpPassword != null && !s.smtpPassword.isEmpty());
        ctx.json(out);
    }

    /**
     * PUT /api/settings. Only the fields present in the body change, so screens can save their part
     * without knowing the rest. Leaving smtpPassword out keeps the stored password; "" removes it.
     */
    public void updateSettings(Context ctx) {
        try {
            AppSettings updated = MAPPER.readerForUpdating(SettingsRepository.loadSettings().copy()).readValue(ctx.body());
            updated.historyRetentionDays = Math.max(1, Math.min(updated.historyRetentionDays, 3650));
            if (updated.smtpSecurity == null) updated.smtpSecurity = "STARTTLS";
            SettingsRepository.saveSettings(updated);
            HistoryRepository.prune();
            getSettings(ctx);
        } catch (Exception e) {
            ctx.status(400).result("Invalid settings format: " + e.getMessage());
        }
    }
}
