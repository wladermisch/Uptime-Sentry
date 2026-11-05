package com.uptimesentry.api;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.persistence.SettingsRepository.AppSettings;
import com.uptimesentry.service.EmailService;
import com.uptimesentry.service.SmtpClient;
import com.uptimesentry.util.SentryLogger;

import io.javalin.http.Context;

/** POST /api/email/test sends a sample outage email so people can check their mail setup. */
public class EmailController {

    private static final ObjectMapper MAPPER = new ObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /** Body of a test request. smtp holds unsaved server settings to try; a missing password uses the stored one. */
    public static class TestRequest {
        public List<String> recipients = new ArrayList<>();
        public String subject;
        public String body;
        public boolean recovery;
        public Map<String, Object> smtp;
    }

    public void sendTest(Context ctx) {
        TestRequest req;
        try {
            req = MAPPER.readValue(ctx.body(), TestRequest.class);
        } catch (Exception e) {
            ctx.status(400).json(Map.of("ok", false, "message", "Invalid request."));
            return;
        }
        AppSettings settings = SettingsRepository.loadSettings().copy();
        if (req.smtp != null) {
            try {
                MAPPER.readerForUpdating(settings).readValue(MAPPER.writeValueAsString(req.smtp));
            } catch (Exception e) {
                ctx.status(400).json(Map.of("ok", false, "message", "Invalid mail server settings."));
                return;
            }
        }
        try {
            EmailService.sendTest(EmailService.server(settings), req.recipients, req.subject, req.body, req.recovery);
            SentryLogger.info("Test email sent to " + String.join(", ", req.recipients));
            ctx.json(Map.of("ok", true, "message", "Test email sent to " + String.join(", ", req.recipients) + "."));
        } catch (SmtpClient.PartialDeliveryException e) {
            ctx.json(Map.of("ok", true, "message", e.getMessage()));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            if (e instanceof java.net.UnknownHostException) msg = "Mail server not found: " + msg;
            else if (e instanceof java.net.SocketTimeoutException) msg = "The mail server didn't answer in time. Check the server name and port.";
            else if (e instanceof java.net.ConnectException) msg = "Couldn't connect to the mail server. Check the server name and port.";
            SentryLogger.warn("Test email failed: " + msg);
            ctx.json(Map.of("ok", false, "message", msg));
        }
    }
}
