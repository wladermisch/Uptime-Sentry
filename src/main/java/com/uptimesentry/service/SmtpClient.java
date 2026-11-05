package com.uptimesentry.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * A small SMTP client for plain-text notification emails: implicit TLS (port 465), STARTTLS (587)
 * or unencrypted (25), with AUTH PLAIN or LOGIN. Server certificates and host names are verified.
 * Keeping this in-house avoids bundling a mail library and extra JDK modules into the runtime.
 */
public final class SmtpClient {

    public static final Pattern ADDRESS = Pattern.compile("^[^\\s@<>,;\"]+@[^\\s@<>,;\"]+\\.[^\\s@<>,;\"]+$");
    private static final int TIMEOUT_MS = 20_000;

    /** Mail server settings. security is STARTTLS, SSL or NONE. */
    public record Server(String host, int port, String security, String username, String password, String from, String fromName) {
    }

    private Socket socket;
    private BufferedReader in;
    private OutputStream out;

    private SmtpClient() {
    }

    /** Sends one message to all recipients. Throws with the server's reply when anything is refused. */
    public static void send(Server server, List<String> recipients, String subject, String body) throws IOException {
        if (server.host() == null || server.host().isBlank()) throw new IOException("No mail server is set up in Settings.");
        if (server.from() == null || !ADDRESS.matcher(server.from().trim()).matches()) throw new IOException("The sender address in Settings is not a valid email address.");
        List<String> to = new ArrayList<>();
        for (String r : recipients) {
            if (r != null && ADDRESS.matcher(r.trim()).matches()) to.add(r.trim());
        }
        if (to.isEmpty()) throw new IOException("No valid recipient address.");

        SmtpClient c = new SmtpClient();
        try {
            c.session(server, to, subject, body);
        } finally {
            c.close();
        }
    }

    private void session(Server s, List<String> to, String subject, String body) throws IOException {
        String security = s.security() == null ? "STARTTLS" : s.security().toUpperCase(Locale.ROOT);
        String host = s.host().trim();
        if ("SSL".equals(security)) {
            SSLSocket ssl = (SSLSocket) SSLSocketFactory.getDefault().createSocket();
            verifyHostname(ssl);
            ssl.connect(new InetSocketAddress(host, s.port()), TIMEOUT_MS);
            ssl.setSoTimeout(TIMEOUT_MS);
            ssl.startHandshake();
            attach(ssl);
        } else {
            Socket plain = new Socket();
            plain.connect(new InetSocketAddress(host, s.port()), TIMEOUT_MS);
            plain.setSoTimeout(TIMEOUT_MS);
            attach(plain);
        }
        expect(220, read());
        List<String> caps = ehlo();

        if ("STARTTLS".equals(security)) {
            if (caps.stream().noneMatch(l -> l.toUpperCase(Locale.ROOT).startsWith("STARTTLS"))) {
                throw new IOException("The mail server doesn't offer STARTTLS. Pick SSL/TLS or another port.");
            }
            command("STARTTLS", 220);
            SSLSocket ssl = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(socket, host, s.port(), true);
            verifyHostname(ssl);
            ssl.setSoTimeout(TIMEOUT_MS);
            ssl.startHandshake();
            attach(ssl);
            caps = ehlo();
        }

        if (s.username() != null && !s.username().isBlank()) authenticate(caps, s.username(), s.password() == null ? "" : s.password());

        command("MAIL FROM:<" + s.from().trim() + ">", 250);
        List<String> refused = new ArrayList<>();
        for (String r : to) {
            String reply = commandRaw("RCPT TO:<" + r + ">");
            if (code(reply) != 250 && code(reply) != 251) refused.add(r + " (" + reply.trim() + ")");
        }
        if (refused.size() == to.size()) throw new IOException("The mail server refused every recipient: " + String.join(", ", refused));
        command("DATA", 354);
        write(message(s, to, subject, body));
        expect(250, read());
        try {
            commandRaw("QUIT");
        } catch (IOException ignored) {
            // The message is already accepted.
        }
        if (!refused.isEmpty()) throw new PartialDeliveryException("Sent, but the mail server refused: " + String.join(", ", refused));
    }

    /** Thrown when the message went out but some recipients were refused. */
    public static class PartialDeliveryException extends IOException {
        public PartialDeliveryException(String message) {
            super(message);
        }
    }

    private static void verifyHostname(SSLSocket ssl) {
        SSLParameters p = ssl.getSSLParameters();
        p.setEndpointIdentificationAlgorithm("HTTPS");
        ssl.setSSLParameters(p);
    }

    private void attach(Socket s) throws IOException {
        socket = s;
        in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
        out = s.getOutputStream();
    }

    private List<String> ehlo() throws IOException {
        String name = "localhost";
        try {
            name = java.net.InetAddress.getLocalHost().getHostName().replaceAll("[^A-Za-z0-9.-]", "");
            if (name.isEmpty()) name = "localhost";
        } catch (IOException ignored) {
            // Fall back to "localhost".
        }
        String reply = commandRaw("EHLO " + name);
        expect(250, reply);
        List<String> caps = new ArrayList<>();
        for (String line : reply.split("\n")) {
            if (line.length() > 4) caps.add(line.substring(4).trim());
        }
        return caps;
    }

    private void authenticate(List<String> caps, String user, String pass) throws IOException {
        String auth = caps.stream().filter(l -> l.toUpperCase(Locale.ROOT).startsWith("AUTH")).findFirst().orElse("").toUpperCase(Locale.ROOT);
        Base64.Encoder b64 = Base64.getEncoder();
        String reply;
        if (auth.contains("PLAIN") || !auth.contains("LOGIN")) {
            String token = b64.encodeToString(("\0" + user + "\0" + pass).getBytes(StandardCharsets.UTF_8));
            reply = commandRaw("AUTH PLAIN " + token, "AUTH PLAIN ****");
        } else {
            expect(334, commandRaw("AUTH LOGIN"));
            expect(334, commandRaw(b64.encodeToString(user.getBytes(StandardCharsets.UTF_8)), "****"));
            reply = commandRaw(b64.encodeToString(pass.getBytes(StandardCharsets.UTF_8)), "****");
        }
        if (code(reply) != 235) {
            throw new IOException("The mail server rejected the user name or password (" + reply.trim()
                + "). Gmail and Outlook need an app password.");
        }
    }

    private static String message(Server s, List<String> to, String subject, String body) {
        String domain = s.from().substring(s.from().indexOf('@') + 1).trim();
        StringBuilder m = new StringBuilder();
        m.append("Date: ").append(ZonedDateTime.now().format(DateTimeFormatter.RFC_1123_DATE_TIME)).append("\r\n");
        String name = s.fromName() == null ? "" : oneLine(s.fromName());
        m.append("From: ").append(name.isEmpty() ? "" : encodeWord(name) + " ").append('<').append(s.from().trim()).append(">\r\n");
        m.append("To: ").append(String.join(", ", to)).append("\r\n");
        m.append("Subject: ").append(encodeWord(oneLine(subject))).append("\r\n");
        m.append("Message-ID: <").append(UUID.randomUUID()).append('@').append(domain).append(">\r\n");
        m.append("MIME-Version: 1.0\r\n");
        m.append("Content-Type: text/plain; charset=UTF-8\r\n");
        m.append("Content-Transfer-Encoding: base64\r\n");
        m.append("X-Mailer: Uptime Sentry\r\n");
        m.append("\r\n");
        String normalized = body.replace("\r\n", "\n").replace("\n", "\r\n");
        // Base64 lines never start with ".", so no dot-stuffing is needed.
        m.append(Base64.getMimeEncoder(76, "\r\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(normalized.getBytes(StandardCharsets.UTF_8)));
        m.append("\r\n.\r\n");
        return m.toString();
    }

    /** Removes line breaks so user text can't add mail headers. */
    private static String oneLine(String v) {
        return v == null ? "" : v.replaceAll("[\\r\\n]+", " ").trim();
    }

    private static String encodeWord(String v) {
        boolean ascii = v.chars().allMatch(ch -> ch >= 0x20 && ch < 0x7F);
        if (ascii && !v.contains("=?")) return v;
        return "=?UTF-8?B?" + Base64.getEncoder().encodeToString(v.getBytes(StandardCharsets.UTF_8)) + "?=";
    }

    private void command(String line, int expected) throws IOException {
        expect(expected, commandRaw(line));
    }

    private String commandRaw(String line) throws IOException {
        return commandRaw(line, line);
    }

    private String commandRaw(String line, String shownAs) throws IOException {
        write(line + "\r\n");
        String reply = read();
        if (reply.isEmpty()) throw new IOException("The mail server closed the connection after " + shownAs);
        return reply;
    }

    private void write(String data) throws IOException {
        out.write(data.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    /** Reads a full (possibly multi-line) reply; lines are joined with \n. */
    private String read() throws IOException {
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            sb.append(line).append('\n');
            if (line.length() < 4 || line.charAt(3) != '-') break;
        }
        return sb.toString();
    }

    private static int code(String reply) {
        try {
            return Integer.parseInt(reply.substring(0, 3));
        } catch (RuntimeException e) {
            return -1;
        }
    }

    private static void expect(int expected, String reply) throws IOException {
        if (code(reply) != expected) {
            throw new IOException("Mail server replied: " + (reply.isBlank() ? "(nothing)" : reply.trim()));
        }
    }

    private void close() {
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // Nothing left to do.
        }
    }
}
