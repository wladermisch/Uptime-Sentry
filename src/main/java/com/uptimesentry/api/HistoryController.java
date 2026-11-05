package com.uptimesentry.api;

import com.uptimesentry.persistence.HistoryRepository;
import io.javalin.http.Context;

import java.time.LocalDateTime;

/** HistoryController handles REST endpoints for check history. */
public class HistoryController {

    /** Without a range the newest week is returned, enough for the live board. */
    private static final int DEFAULT_DAYS = 7;
    private static final int DEFAULT_LIMIT = 5000;
    private static final int MAX_LIMIT = 2_000_000;

    /**
     * GET /api/history?since=yyyy-MM-dd HH:mm:ss&amp;until=…&amp;targetId=…&amp;limit=…
     * Results are newest first.
     */
    public void getHistory(Context ctx) {
        String since = normalize(ctx.queryParam("since"));
        String until = normalize(ctx.queryParam("until"));
        Integer targetId = parseInt(ctx.queryParam("targetId"));
        Integer limitParam = parseInt(ctx.queryParam("limit"));
        int limit;
        if (since == null && until == null) {
            since = LocalDateTime.now().minusDays(DEFAULT_DAYS).format(HistoryRepository.TS);
            limit = limitParam != null ? limitParam : DEFAULT_LIMIT;
        } else {
            limit = limitParam != null ? limitParam : MAX_LIMIT;
        }
        limit = Math.max(1, Math.min(limit, MAX_LIMIT));
        ctx.json(HistoryRepository.query(since, until, targetId, limit));
    }

    /** GET /api/history/stats */
    public void getStats(Context ctx) {
        ctx.json(HistoryRepository.stats());
    }

    public void clearHistory(Context ctx) {
        HistoryRepository.clearHistory();
        ctx.status(204);
    }

    /** Accepts "yyyy-MM-dd HH:mm:ss" or ISO "yyyy-MM-ddTHH:mm:ss…"; returns the stored format or null. */
    static String normalize(String v) {
        if (v == null || v.isBlank()) return null;
        String s = v.trim().replace('T', ' ');
        if (s.length() > 19) s = s.substring(0, 19);
        if (s.length() == 10) s = s + " 00:00:00";
        return s.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}") ? s : null;
    }

    private static Integer parseInt(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
