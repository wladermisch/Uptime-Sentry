package com.uptimesentry.api;

import com.uptimesentry.service.AutoCheckService;
import io.javalin.http.Context;

import java.util.Map;

/** AutoCheckController handles REST endpoints for auto-check lifecycle management. */
public class AutoCheckController {

    private final AutoCheckService autoCheckService;
    private volatile boolean running = false;
    private volatile int intervalSeconds = 60;

    public AutoCheckController(AutoCheckService autoCheckService) {
        this.autoCheckService = autoCheckService;
    }

    public void getStatus(Context ctx) {
        ctx.json(Map.of("running", running, "intervalSeconds", intervalSeconds));
    }

    public void start(Context ctx) {
        autoCheckService.startAutoChecks();
        running = true;
        ctx.json(Map.of("running", true, "intervalSeconds", intervalSeconds));
    }

    public void stop(Context ctx) {
        autoCheckService.stopAutoChecks();
        running = false;
        ctx.json(Map.of("running", false, "intervalSeconds", intervalSeconds));
    }

    public void setInterval(Context ctx) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = ctx.bodyAsClass(Map.class);
            Object val = body.get("intervalSeconds");
            if (val == null) { ctx.status(400).result("intervalSeconds required"); return; }
            int secs = ((Number) val).intValue();
            if (secs < 1) { ctx.status(400).result("intervalSeconds must be >= 1"); return; }
            intervalSeconds = secs;
            autoCheckService.setIntervalSeconds(secs);
            ctx.json(Map.of("running", running, "intervalSeconds", intervalSeconds));
        } catch (Exception e) { ctx.status(400).result("Invalid body: " + e.getMessage()); }
    }
}