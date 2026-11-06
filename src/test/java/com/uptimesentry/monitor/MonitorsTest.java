package com.uptimesentry.monitor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.ServerSocket;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.uptimesentry.model.MonitoredTarget;

class MonitorsTest {

    private static MonitoredTarget t(String type, String host, int port) {
        MonitoredTarget m = new MonitoredTarget(1, "x", type, host, 2, "", List.of());
        m.setPort(port);
        return m;
    }

    @Test
    void picksTheCheckForEachType() {
        assertInstanceOf(HttpMonitor.class, Monitors.create(t("http", "https://a", 0)));
        assertInstanceOf(PingMonitor.class, Monitors.create(t("PING", "a", 0)));
        assertInstanceOf(TcpMonitor.class, Monitors.create(t("TCP", "a", 22)));
        assertInstanceOf(DnsMonitor.class, Monitors.create(t("DNS", "a", 0)));
        assertInstanceOf(SslMonitor.class, Monitors.create(t("SSL", "a", 0)));
        assertNull(Monitors.create(t("FTP", "a", 0)));
    }

    @Test
    void readsHostAndPortFromWhatPeopleType() {
        assertEquals("example.com", Monitors.hostOf("https://example.com:8443/path"));
        assertEquals("example.com", Monitors.hostOf("example.com:22"));
        assertEquals("example.com", Monitors.hostOf("example.com/x"));
        assertEquals("::1", Monitors.hostOf("[::1]:5432"));
        assertEquals(8443, Monitors.portOf(t("SSL", "https://example.com:8443/", 0), 443));
        assertEquals(443, Monitors.portOf(t("SSL", "https://example.com/", 0), 443));
        assertEquals(22, Monitors.portOf(t("TCP", "example.com:22", 0), -1));
        assertEquals(5432, Monitors.portOf(t("TCP", "example.com:22", 5432), -1));
        assertEquals(-1, Monitors.portOf(t("TCP", "example.com", 0), -1));
    }

    @Test
    void tcpCheckSeesAnOpenAndAClosedPort() throws Exception {
        int closedPort;
        try (ServerSocket server = new ServerSocket(0)) {
            TcpMonitor open = new TcpMonitor(t("TCP", "127.0.0.1", server.getLocalPort()));
            assertTrue(open.checkAvailability(), open.getLastMessage());
            closedPort = server.getLocalPort();
        }
        TcpMonitor closed = new TcpMonitor(t("TCP", "127.0.0.1", closedPort));
        assertFalse(closed.checkAvailability());
        assertTrue(closed.getLastMessage().contains(String.valueOf(closedPort)));
    }

    @Test
    void dnsCheckComparesExpectedAddresses() {
        MonitoredTarget target = t("DNS", "localhost", 0);
        target.setDnsExpected("127.0.0.1, ::1");
        assertTrue(new DnsMonitor(target).checkAvailability());
        target.setDnsExpected("10.9.9.9");
        DnsMonitor wrong = new DnsMonitor(target);
        assertFalse(wrong.checkAvailability());
        assertTrue(wrong.getLastMessage().contains("expected 10.9.9.9"));
    }
}
