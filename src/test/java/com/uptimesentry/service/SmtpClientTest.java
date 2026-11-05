package com.uptimesentry.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class SmtpClientTest {

    /** A one-connection fake SMTP server that records what the client sends. */
    private static final class FakeServer implements AutoCloseable {
        final ServerSocket socket = new ServerSocket(0);
        final List<String> received = new ArrayList<>();
        final StringBuilder data = new StringBuilder();
        final Thread thread;
        final boolean rejectSecondRecipient;

        FakeServer(boolean rejectSecondRecipient) throws IOException {
            this.rejectSecondRecipient = rejectSecondRecipient;
            thread = new Thread(this::serve);
            thread.start();
        }

        private void serve() {
            try (Socket s = socket.accept()) {
                BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                OutputStream out = s.getOutputStream();
                say(out, "220 fake ESMTP");
                int rcpt = 0;
                String line;
                while ((line = in.readLine()) != null) {
                    received.add(line);
                    if (line.startsWith("EHLO")) say(out, "250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 OK");
                    else if (line.startsWith("AUTH PLAIN")) say(out, "235 ok");
                    else if (line.startsWith("MAIL FROM")) say(out, "250 ok");
                    else if (line.startsWith("RCPT TO")) say(out, (rcpt++ == 1 && rejectSecondRecipient) ? "550 no such user" : "250 ok");
                    else if (line.equals("DATA")) {
                        say(out, "354 go");
                        String d;
                        while ((d = in.readLine()) != null && !d.equals(".")) data.append(d).append('\n');
                        say(out, "250 queued");
                    } else if (line.equals("QUIT")) {
                        say(out, "221 bye");
                        return;
                    } else say(out, "500 ?");
                }
            } catch (IOException ignored) {
                // Test ends.
            }
        }

        private static void say(OutputStream out, String reply) throws IOException {
            out.write((reply + "\r\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        }

        SmtpClient.Server config() {
            return new SmtpClient.Server("127.0.0.1", socket.getLocalPort(), "NONE", "me", "secret", "alerts@example.com", "Uptime Sentry");
        }

        @Override
        public void close() throws Exception {
            thread.join(5000);
            socket.close();
        }
    }

    @Test
    void sendsToEveryRecipientWithEncodedBody() throws Exception {
        try (FakeServer server = new FakeServer(false)) {
            SmtpClient.send(server.config(), List.of("a@example.com", "b@example.com"), "Ünïcode subject", "Line one\nLine two – ok");
            server.thread.join(5000);
            assertTrue(server.received.contains("RCPT TO:<a@example.com>"));
            assertTrue(server.received.contains("RCPT TO:<b@example.com>"));
            String expectedAuth = "AUTH PLAIN " + Base64.getEncoder().encodeToString("\0me\0secret".getBytes(StandardCharsets.UTF_8));
            assertTrue(server.received.contains(expectedAuth));
            String msg = server.data.toString();
            assertTrue(msg.contains("Subject: =?UTF-8?B?"));
            String encoded = msg.substring(msg.indexOf("\n\n") + 2).replace("\n", "");
            assertEquals("Line one\r\nLine two – ok", new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8));
        }
    }

    @Test
    void reportsRefusedRecipientsAfterSending() throws Exception {
        try (FakeServer server = new FakeServer(true)) {
            IOException e = assertThrows(SmtpClient.PartialDeliveryException.class,
                () -> SmtpClient.send(server.config(), List.of("a@example.com", "nobody@example.com"), "s", "b"));
            assertTrue(e.getMessage().contains("nobody@example.com"));
        }
    }

    @Test
    void rejectsHeaderInjectionAndBadAddresses() {
        SmtpClient.Server cfg = new SmtpClient.Server("127.0.0.1", 1, "NONE", "", "", "alerts@example.com", "");
        assertThrows(IOException.class, () -> SmtpClient.send(cfg, List.of("not-an-address", "x@y.z\r\nBcc: evil@x.com"), "s", "b"));
    }

    @Test
    void rendersPlaceholders() {
        String out = EmailService.render("{target} is {status} ({unknown})", Map.of("target", "Site $1", "status", "DOWN"));
        assertEquals("Site $1 is DOWN ({unknown})", out);
    }
}
