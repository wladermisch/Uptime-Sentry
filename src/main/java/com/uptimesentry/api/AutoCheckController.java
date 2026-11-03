package com.uptimesentry.api;

import com.uptimesentry.service.AutoCheckService;
import io.javalin.http.Context;

import java.util.Map;

/** AutoCheckController handles REST endpoints for auto-check lifecycle management. */
public class AutoCheckController {

    private final AutoCheckService autoCheckService;

    public AutoCheckController(AutoCheckService autoCheckService) {
        this.autoCheckService = autoCheckService;
    }

    /** Reports the service's real state; ApiServer starts auto-checks at boot, so this is "running" from the start. */
    private Map<String, Object> status() {
        return Map.of("running", autoCheckService.isRunning(), "intervalSeconds", autoCheckService.getIntervalSeconds());
    }

    public void getStatus(Context ctx) {
        ctx.json(status());
    }

    public void start(Context ctx) {
        autoCheckService.startAutoChecks();
        ctx.json(status());
    }

    public void stop(Context ctx) {
        autoCheckService.stopAutoChecks();
        ctx.json(status());
    }

    public void setInterval(Context ctx) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = ctx.bodyAsClass(Map.class);
            Object val = body.get("intervalSeconds");
            if (val == null) { ctx.status(400).result("intervalSeconds required"); return; }
            int secs = ((Number) val).intValue();
            if (secs < 1) { ctx.status(400).result("intervalSeconds must be >= 1"); return; }
            autoCheckService.setIntervalSeconds(secs);
            ctx.json(status());
        } catch (Exception e) { ctx.status(400).result("Invalid body: " + e.getMessage()); }
    }
}