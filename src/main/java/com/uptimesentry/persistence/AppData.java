package com.uptimesentry.persistence;

import java.lang.reflect.Type;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.google.gson.reflect.TypeToken;
import com.uptimesentry.model.MaintenanceWindow;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.model.ReportSchedule;
import com.uptimesentry.model.Webhook;

/**
 * Maintenance windows, webhooks, scheduled reports and outage notes, each in its own JSON file
 * next to targets.json. Lists are replaced as a whole by the desktop app, so the files stay simple.
 */
public final class AppData {

    private static final Path MAINTENANCE_FILE = Paths.get("maintenance.json");
    private static final Path WEBHOOKS_FILE = Paths.get("webhooks.json");
    private static final Path SCHEDULES_FILE = Paths.get("schedules.json");
    private static final Path NOTES_FILE = Paths.get("notes.json");

    private static final Type MAINTENANCE_TYPE = new TypeToken<List<MaintenanceWindow>>() { }.getType();
    private static final Type WEBHOOKS_TYPE = new TypeToken<List<Webhook>>() { }.getType();
    private static final Type SCHEDULES_TYPE = new TypeToken<List<ReportSchedule>>() { }.getType();
    private static final Type NOTES_TYPE = new TypeToken<LinkedHashMap<String, List<Note>>>() { }.getType();

    private static List<MaintenanceWindow> maintenance;
    private static List<Webhook> webhooks;
    private static List<ReportSchedule> schedules;
    private static Map<String, List<Note>> notes;

    /** A note on an outage. Outages are keyed "targetId-yyyy-MM-dd HH:mm:ss" (the first failed check). */
    public static class Note {
        public String time;
        public String text;

        public Note() {
        }

        public Note(String time, String text) {
            this.time = time;
            this.text = text;
        }
    }

    private AppData() {
    }

    // ── Maintenance ─────────────────────────────────────────────────────────

    public static synchronized List<MaintenanceWindow> maintenance() {
        if (maintenance == null) maintenance = JsonFile.read(MAINTENANCE_FILE, MAINTENANCE_TYPE, ArrayList::new);
        return new ArrayList<>(maintenance);
    }

    public static synchronized void saveMaintenance(List<MaintenanceWindow> list) {
        List<MaintenanceWindow> clean = new ArrayList<>();
        for (MaintenanceWindow w : list == null ? List.<MaintenanceWindow>of() : list) {
            if (w == null) continue;
            if (w.id == null || w.id.isBlank()) w.id = UUID.randomUUID().toString();
            clean.add(w);
        }
        maintenance = clean;
        JsonFile.write(MAINTENANCE_FILE, clean);
    }

    /** The active window covering this target, or null. */
    public static MaintenanceWindow activeMaintenance(MonitoredTarget target, LocalDateTime now) {
        for (MaintenanceWindow w : maintenance()) {
            if (w.covers(target) && w.isActive(now)) return w;
        }
        return null;
    }

    // ── Webhooks ────────────────────────────────────────────────────────────

    public static synchronized List<Webhook> webhooks() {
        if (webhooks == null) webhooks = JsonFile.read(WEBHOOKS_FILE, WEBHOOKS_TYPE, ArrayList::new);
        return new ArrayList<>(webhooks);
    }

    public static synchronized void saveWebhooks(List<Webhook> list) {
        List<Webhook> clean = new ArrayList<>();
        for (Webhook w : list == null ? List.<Webhook>of() : list) {
            if (w == null) continue;
            if (w.id == null || w.id.isBlank()) w.id = UUID.randomUUID().toString();
            clean.add(w);
        }
        webhooks = clean;
        JsonFile.write(WEBHOOKS_FILE, clean);
    }

    // ── Scheduled reports ───────────────────────────────────────────────────

    public static synchronized List<ReportSchedule> schedules() {
        if (schedules == null) schedules = JsonFile.read(SCHEDULES_FILE, SCHEDULES_TYPE, ArrayList::new);
        return new ArrayList<>(schedules);
    }

    /** Replaces the list, keeping when each schedule was last sent (the app doesn't track that). */
    public static synchronized void saveSchedules(List<ReportSchedule> list) {
        Map<String, ReportSchedule> old = new LinkedHashMap<>();
        for (ReportSchedule s : schedules()) old.put(s.id, s);
        List<ReportSchedule> clean = new ArrayList<>();
        for (ReportSchedule s : list == null ? List.<ReportSchedule>of() : list) {
            if (s == null) continue;
            if (s.id == null || s.id.isBlank()) s.id = UUID.randomUUID().toString();
            ReportSchedule prev = old.get(s.id);
            if (prev != null && s.lastSent == null) {
                s.lastSent = prev.lastSent;
                s.lastError = prev.lastError;
            } else if (prev == null && s.lastSent == null) {
                // A new schedule starts with its next due time, not one that already passed today.
                s.lastSent = LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            }
            clean.add(s);
        }
        schedules = clean;
        JsonFile.write(SCHEDULES_FILE, clean);
    }

    public static synchronized void markScheduleSent(String id, String sentAt, String error) {
        List<ReportSchedule> list = schedules();
        for (ReportSchedule s : list) {
            if (!s.id.equals(id)) continue;
            if (sentAt != null) s.lastSent = sentAt;
            s.lastError = error;
        }
        schedules = list;
        JsonFile.write(SCHEDULES_FILE, list);
    }

    // ── Outage notes ────────────────────────────────────────────────────────

    public static synchronized Map<String, List<Note>> notes() {
        if (notes == null) notes = JsonFile.read(NOTES_FILE, NOTES_TYPE, LinkedHashMap::new);
        Map<String, List<Note>> copy = new LinkedHashMap<>();
        notes.forEach((k, v) -> copy.put(k, new ArrayList<>(v)));
        return copy;
    }

    /** Sets the notes for one outage; an empty list removes them. */
    public static synchronized void saveNotes(String outageId, List<Note> list) {
        Map<String, List<Note>> all = notes();
        if (list == null || list.isEmpty()) all.remove(outageId);
        else all.put(outageId, new ArrayList<>(list));
        notes = all;
        JsonFile.write(NOTES_FILE, all);
    }

    public static synchronized void replaceAllNotes(Map<String, List<Note>> all) {
        notes = all == null ? new LinkedHashMap<>() : new LinkedHashMap<>(all);
        JsonFile.write(NOTES_FILE, notes);
    }

    /** Forgets everything (application reset). */
    public static synchronized void clearAll() {
        maintenance = new ArrayList<>();
        webhooks = new ArrayList<>();
        schedules = new ArrayList<>();
        notes = new LinkedHashMap<>();
        JsonFile.delete(MAINTENANCE_FILE);
        JsonFile.delete(WEBHOOKS_FILE);
        JsonFile.delete(SCHEDULES_FILE);
        JsonFile.delete(NOTES_FILE);
    }
}
