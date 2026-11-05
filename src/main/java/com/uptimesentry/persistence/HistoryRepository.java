package com.uptimesentry.persistence;

import java.io.BufferedWriter;
import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import com.uptimesentry.model.CheckResult;
import com.uptimesentry.util.SentryLogger;

/**
 * Check history, kept in memory and stored as one JSON object per line (history.jsonl) so a new
 * check is a single append instead of rewriting the whole file.
 *
 * Results older than the retention period in settings are dropped (default 30 days), with a hard cap
 * on the number of entries so a very short check interval can't grow the file without bound.
 * Timestamps are "yyyy-MM-dd HH:mm:ss" strings, which sort chronologically as plain text.
 */
public class HistoryRepository {
    private static final Path HISTORY_FILE = Paths.get("history.jsonl");
    /** The pre-0.5 format: one pretty-printed JSON array, newest first, capped at 200 entries. */
    private static final Path LEGACY_FILE = Paths.get("history.json");
    private static final int MAX_ENTRIES = 1_000_000;
    private static final int PRUNE_EVERY_ADDS = 500;
    public static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static final Gson GSON = new Gson();
    /** Oldest first. Loaded lazily on first use. */
    private static List<CheckResult> entries;
    private static int addsSincePrune = 0;

    private HistoryRepository() {
    }

    private static List<CheckResult> entries() {
        if (entries == null) {
            entries = load();
            prune();
        }
        return entries;
    }

    private static List<CheckResult> load() {
        List<CheckResult> list = new ArrayList<>();
        if (Files.exists(HISTORY_FILE)) {
            try {
                for (String line : Files.readAllLines(HISTORY_FILE, StandardCharsets.UTF_8)) {
                    if (line.isBlank()) continue;
                    try {
                        CheckResult r = GSON.fromJson(line, CheckResult.class);
                        if (r != null && r.getTimestamp() != null) list.add(r);
                    } catch (JsonParseException bad) {
                        // A half-written last line after a crash: skip it.
                    }
                }
            } catch (IOException e) {
                SentryLogger.error("Failed to read check history: " + e.getMessage());
            }
        } else if (Files.exists(LEGACY_FILE)) {
            list.addAll(loadLegacy());
            rewrite(list);
            try {
                Files.move(LEGACY_FILE, Paths.get("history.json.migrated"), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
                // Leaving the old file in place is harmless: it is only read when history.jsonl is missing.
            }
            SentryLogger.info("Migrated " + list.size() + " history entries to history.jsonl", false);
        }
        list.sort((a, b) -> a.getTimestamp().compareTo(b.getTimestamp()));
        return list;
    }

    private static List<CheckResult> loadLegacy() {
        try {
            Type listType = new TypeToken<List<CheckResult>>() {}.getType();
            List<CheckResult> list = GSON.fromJson(Files.readString(LEGACY_FILE), listType);
            return list != null ? list : new ArrayList<>();
        } catch (IOException | JsonParseException e) {
            return new ArrayList<>();
        }
    }

    /** All results, newest first. */
    public static synchronized List<CheckResult> loadHistory() {
        List<CheckResult> copy = new ArrayList<>(entries());
        Collections.reverse(copy);
        return copy;
    }

    /**
     * Results with since &lt;= timestamp &lt;= until (either bound may be null), optionally for one target,
     * newest first and at most {@code limit} of them.
     */
    public static synchronized List<CheckResult> query(String since, String until, Integer targetId, int limit) {
        List<CheckResult> all = entries();
        List<CheckResult> out = new ArrayList<>();
        for (int i = all.size() - 1; i >= 0 && out.size() < limit; i--) {
            CheckResult r = all.get(i);
            String ts = r.getTimestamp();
            if (since != null && ts.compareTo(since) < 0) break; // sorted: everything further back is older
            if (until != null && ts.compareTo(until) > 0) continue;
            if (targetId != null && r.getTargetId() != targetId) continue;
            out.add(r);
        }
        return out;
    }

    public static synchronized void addResult(CheckResult result) {
        List<CheckResult> all = entries();
        // Checks arrive in time order; insert in place in the rare case one doesn't (clock change).
        int i = all.size();
        while (i > 0 && all.get(i - 1).getTimestamp().compareTo(result.getTimestamp()) > 0) i--;
        all.add(i, result);
        try {
            Files.writeString(HISTORY_FILE, GSON.toJson(result) + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            SentryLogger.error("Failed to save check history: " + e.getMessage());
        }
        if (++addsSincePrune >= PRUNE_EVERY_ADDS) prune();
    }

    /** Drops results older than the retention period or beyond the hard cap, and compacts the file. */
    public static synchronized void prune() {
        addsSincePrune = 0;
        List<CheckResult> all = entries;
        if (all == null) return;
        int days = Math.max(1, SettingsRepository.loadSettings().historyRetentionDays);
        String cutoff = LocalDateTime.now().minusDays(days).format(TS);
        int drop = 0;
        while (drop < all.size() && all.get(drop).getTimestamp().compareTo(cutoff) < 0) drop++;
        drop = Math.max(drop, all.size() - MAX_ENTRIES);
        if (drop <= 0) return;
        all.subList(0, drop).clear();
        rewrite(all);
    }

    private static void rewrite(List<CheckResult> all) {
        Path tmp = Paths.get("history.jsonl.tmp");
        try (BufferedWriter w = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
            for (CheckResult r : all) {
                w.write(GSON.toJson(r));
                w.write('\n');
            }
        } catch (IOException e) {
            SentryLogger.error("Failed to compact check history: " + e.getMessage());
            return;
        }
        try {
            Files.move(tmp, HISTORY_FILE, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            try {
                Files.move(tmp, HISTORY_FILE, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e2) {
                SentryLogger.error("Failed to compact check history: " + e2.getMessage());
            }
        }
    }

    /** Number of stored results, size of the history file in bytes, and the oldest timestamp (or null). */
    public static synchronized Stats stats() {
        List<CheckResult> all = entries();
        long bytes = 0;
        try {
            if (Files.exists(HISTORY_FILE)) bytes = Files.size(HISTORY_FILE);
        } catch (IOException ignored) {
            // Size is informational only.
        }
        return new Stats(all.size(), bytes, all.isEmpty() ? null : all.get(0).getTimestamp(),
            SettingsRepository.loadSettings().historyRetentionDays);
    }

    public record Stats(int checks, long bytes, String oldest, int retentionDays) {
    }

    public static synchronized void saveHistory(List<CheckResult> history) {
        List<CheckResult> sorted = new ArrayList<>(history);
        sorted.sort((a, b) -> a.getTimestamp().compareTo(b.getTimestamp()));
        entries = sorted;
        rewrite(sorted);
    }

    public static synchronized void clearHistory() {
        entries = new ArrayList<>();
        try {
            Files.deleteIfExists(HISTORY_FILE);
            Files.deleteIfExists(LEGACY_FILE);
        } catch (IOException e) {
            SentryLogger.error("Failed to clear history: " + e.getMessage());
        }
    }
}
