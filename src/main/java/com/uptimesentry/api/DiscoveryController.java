package com.uptimesentry.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.uptimesentry.discovery.DiscoveryService;
import com.uptimesentry.discovery.Networks;
import com.uptimesentry.persistence.SettingsRepository;

import io.javalin.http.Context;

/**
 * Network discovery, off unless switched on in Settings. Every run is started by the person,
 * on networks they pick from this computer's own private networks.
 */
public class DiscoveryController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final DiscoveryService service = new DiscoveryService();

    /** GET /api/discovery/networks: whether discovery is on, and the networks it may look at. */
    public void networks(Context ctx) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Networks.Local n : Networks.local()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.id());
            m.put("name", n.name());
            m.put("address", n.address());
            m.put("range", n.range());
            m.put("virtual", n.virtual());
            list.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", SettingsRepository.loadSettings().discoveryEnabled);
        out.put("networks", list);
        out.put("ports", DiscoveryService.PORTS);
        ctx.json(out);
    }

    /** POST /api/discovery/start {networks: [id], ports: true|false} */
    public void start(Context ctx) throws Exception {
        if (!SettingsRepository.loadSettings().discoveryEnabled) {
            ctx.status(403).json(Map.of("message", "Network discovery is switched off. Turn it on in Settings first."));
            return;
        }
        JsonNode body = MAPPER.readTree(ctx.body());
        List<String> wanted = new ArrayList<>();
        body.path("networks").forEach(n -> wanted.add(n.asText()));
        // Only networks this computer is on right now, never an address range from the request.
        List<Networks.Local> chosen = Networks.local().stream().filter(n -> wanted.contains(n.id())).toList();
        if (chosen.isEmpty()) {
            ctx.status(400).json(Map.of("message", "Pick at least one of this computer's networks."));
            return;
        }
        if (!service.start(chosen, body.path("ports").asBoolean(false))) {
            ctx.status(409).json(Map.of("message", "A search is already running."));
            return;
        }
        ctx.json(service.status());
    }

    public void status(Context ctx) {
        ctx.json(service.status());
    }

    public void cancel(Context ctx) {
        service.cancel();
        ctx.json(service.status());
    }
}
