package com.uptimesentry.discovery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

class DiscoveryTest {

    @Test
    void onlyPrivateAddressesAreInScope() {
        assertTrue(Networks.isPrivate("192.168.1.20"));
        assertTrue(Networks.isPrivate("10.0.0.5"));
        assertTrue(Networks.isPrivate("172.16.4.1"));
        assertTrue(Networks.isPrivate("172.31.255.254"));
        assertFalse(Networks.isPrivate("172.32.0.1"));
        assertFalse(Networks.isPrivate("8.8.8.8"));
        assertFalse(Networks.isPrivate("192.169.1.1"));
        assertFalse(Networks.isPrivate("not an ip"));
        assertFalse(Networks.isPrivate("192.168.1.300"));
    }

    @Test
    void recognisesServicesByWhatTheySayBeforeTheirPort() {
        Signatures.Match nas = Signatures.forService(5001, "Synology DiskStation - nas", null, null);
        assertEquals("Synology DiskStation", nas.signature().name);
        assertEquals("IDENTIFIED", nas.confidence());

        Signatures.Match ha = Signatures.forService(8123, null, null, null);
        assertEquals("Home Assistant", ha.signature().name);
        assertEquals("LIKELY", ha.confidence());

        Signatures.Match ssh = Signatures.forService(22, null, null, null);
        assertEquals("SSH server", ssh.signature().name);

        Signatures.Match grafanaElsewhere = Signatures.forService(8080, "Grafana", null, null);
        assertEquals("Grafana", grafanaElsewhere.signature().name);

        assertNull(Signatures.forService(12345, null, null, null));
        assertEquals("Printer", Signatures.forMdns("_ipp._tcp", "Office printer").signature().name);
        assertEquals("FRITZ!Box", Signatures.forSsdp("AVM FRITZ!Box 7590 InternetGatewayDevice").signature().name);
    }

    @Test
    void suggestsTheRightAddressForEachCheck() {
        assertEquals("https://192.168.1.20:5001", DiscoveryService.suggestHost("192.168.1.20", 5001, "HTTP"));
        assertEquals("https://192.168.1.20", DiscoveryService.suggestHost("192.168.1.20", 443, "HTTP"));
        assertEquals("http://192.168.1.20", DiscoveryService.suggestHost("192.168.1.20", 80, "HTTP"));
        assertEquals("http://192.168.1.20:8123", DiscoveryService.suggestHost("192.168.1.20", 8123, "HTTP"));
        assertEquals("192.168.1.20", DiscoveryService.suggestHost("192.168.1.20", 22, "TCP"));
    }

    private static void name(ByteArrayOutputStream b, String n) {
        for (String l : n.split("\\.")) {
            byte[] x = l.getBytes(StandardCharsets.UTF_8);
            b.write(x.length);
            b.writeBytes(x);
        }
        b.write(0);
    }

    private static void rr(ByteArrayOutputStream b, String owner, int type, byte[] rdata) {
        name(b, owner);
        b.writeBytes(new byte[] { 0, (byte) type, 0, 1, 0, 0, 0, 120, 0, (byte) rdata.length });
        b.writeBytes(rdata);
    }

    @Test
    void readsPtrSrvAndAddressRecords() {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.writeBytes(new byte[] { 0, 0, (byte) 0x84, 0, 0, 0, 0, 3, 0, 0, 0, 0 });
        ByteArrayOutputStream ptr = new ByteArrayOutputStream();
        name(ptr, "Office printer._ipp._tcp.local");
        rr(b, "_ipp._tcp.local", 12, ptr.toByteArray());
        ByteArrayOutputStream srv = new ByteArrayOutputStream();
        srv.writeBytes(new byte[] { 0, 0, 0, 0, 0x02, 0x77 }); // priority, weight, port 631
        name(srv, "printer.local");
        rr(b, "Office printer._ipp._tcp.local", 33, srv.toByteArray());
        rr(b, "printer.local", 1, new byte[] { (byte) 192, (byte) 168, 1, 40 });
        byte[] packet = b.toByteArray();

        List<Mdns.Service> services = Mdns.parse(packet, packet.length, "192.168.1.99");
        assertEquals(1, services.size());
        Mdns.Service s = services.get(0);
        assertEquals("_ipp._tcp", s.type());
        assertEquals("Office printer", s.instance());
        assertEquals(631, s.port());
        assertEquals("printer", s.host());
        assertEquals("192.168.1.40", s.ip());
    }

    @Test
    void buildsOneQuestionPerServiceType() {
        byte[] q = Mdns.query(new String[] { "_http._tcp", "_ssh._tcp" });
        assertEquals(2, q[5]);
        assertNotNull(q);
        assertTrue(new String(q, StandardCharsets.US_ASCII).contains("_http"));
    }
}
