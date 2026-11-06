package com.uptimesentry.monitor;

import java.net.InetSocketAddress;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

import com.uptimesentry.model.MonitoredTarget;

/**
 * Checks a TLS certificate: the handshake must succeed with a trusted certificate that matches the
 * host name, and the certificate must stay valid for longer than the warning period. Counts as down
 * when it is invalid, expired, or about to expire, so the renewal isn't missed.
 */
public class SslMonitor implements Monitorable {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy").withZone(ZoneId.systemDefault());

    private final MonitoredTarget target;
    private long lastResponseTime;
    private String lastMessage;

    public SslMonitor(MonitoredTarget target) {
        this.target = target;
    }

    @Override
    public boolean checkAvailability() {
        String host = Monitors.hostOf(target.getHost());
        int port = Monitors.portOf(target, 443);
        int timeout = Math.max(1, target.getTimeout());
        if (host.isEmpty()) {
            lastResponseTime = -1;
            lastMessage = "No host name set";
            return false;
        }
        long start = System.nanoTime();
        try (SSLSocket socket = (SSLSocket) SSLSocketFactory.getDefault().createSocket()) {
            SSLParameters params = socket.getSSLParameters();
            params.setEndpointIdentificationAlgorithm("HTTPS");
            socket.setSSLParameters(params);
            socket.connect(new InetSocketAddress(host, port), timeout * 1000);
            socket.setSoTimeout(timeout * 1000);
            socket.startHandshake();
            lastResponseTime = (System.nanoTime() - start) / 1_000_000;

            Certificate[] chain = socket.getSession().getPeerCertificates();
            if (chain.length == 0 || !(chain[0] instanceof X509Certificate cert)) {
                lastMessage = "The server sent no certificate";
                return false;
            }
            Instant expires = cert.getNotAfter().toInstant();
            long daysLeft = Duration.between(Instant.now(), expires).toDays();
            String when = DAY.format(expires);
            if (daysLeft < 0) {
                lastMessage = "Certificate expired on " + when;
                return false;
            }
            int warn = target.getSslWarnDays();
            if (daysLeft < warn) {
                lastMessage = "Certificate expires in " + daysLeft + (daysLeft == 1 ? " day" : " days") + " (" + when + ")";
                return false;
            }
            lastMessage = "Certificate valid for " + daysLeft + " days, until " + when;
            return true;
        } catch (javax.net.ssl.SSLHandshakeException e) {
            lastResponseTime = -1;
            String m = e.getMessage() == null ? "" : e.getMessage();
            lastMessage = m.contains("No subject alternative") || m.contains("doesn't match")
                ? "Certificate doesn't match " + host
                : m.contains("expired") ? "Certificate expired" : "Certificate not trusted: " + m;
            return false;
        } catch (Exception e) {
            lastResponseTime = -1;
            lastMessage = HttpMonitor.describe(e, timeout);
            return false;
        }
    }

    @Override
    public long getResponseTime() {
        return lastResponseTime;
    }

    @Override
    public int getTimeout() {
        return target.getTimeout();
    }

    @Override
    public String getLastMessage() {
        return lastMessage;
    }

    @Override
    public void executeRecovery() {
        Monitors.runRecovery(target);
    }
}
