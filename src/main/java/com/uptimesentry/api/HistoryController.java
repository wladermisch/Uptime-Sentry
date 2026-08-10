package com.uptimesentry.api;

import com.uptimesentry.persistence.HistoryRepository;
import io.javalin.http.Context;

/** HistoryController handles REST endpoints for check history. */
public class HistoryController {

    public void getHistory(Context ctx) {
        ctx.json(HistoryRepository.loadHistory());
    }

    public void clearHistory(Context ctx) {
        HistoryRepository.clearHistory();
        ctx.status(204);
    }
}