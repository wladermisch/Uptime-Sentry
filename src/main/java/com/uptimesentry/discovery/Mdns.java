package com.uptimesentry.discovery;

import java.io.ByteArrayOutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Asks the local network once which services announce themselves over mDNS (Bonjour/Avahi):
 * printers, NAS boxes, Home Assistant, media players. It is a one-shot query from a random port
 * (RFC 6762 § 6.7), so devices answer this program directly and nothing joins the multicast group.
 */
public final class Mdns {

    static final String[] TYPES = {
        "_http._tcp", "_https._tcp", "_ssh._tcp", "_sftp-ssh._tcp", "_smb._tcp", "_ipp._tcp", "_ipps._tcp",
        "_printer._tcp", "_pdl-datastream._tcp", "_home-assistant._tcp", "_googlecast._tcp", "_airplay._tcp",
        "_raop._tcp", "_hap._tcp", "_workstation._tcp", "_device-info._tcp", "_plexmediasvr._tcp",
        "_octoprint._tcp", "_mqtt._tcp", "_esphomelib._tcp", "_rfb._tcp", "_hue._tcp", "_sonos._tcp", "_shelly._tcp",
    };

    /** One announced service: its type ("_ipp._tcp"), instance name, port and address. */
    public record Service(String type, String instance, int port, String host, String ip) {
    }

    private Mdns() {
    }

    public static List<Service> browse(List<NetworkInterface> interfaces, int waitMs) {
        List<Service> out = new ArrayList<>();
        byte[] query = query(TYPES);
        for (NetworkInterface ni : interfaces) {
            try (MulticastSocket socket = new MulticastSocket(0)) {
                socket.setNetworkInterface(ni);
                socket.setTimeToLive(255);
                socket.send(new DatagramPacket(query, query.length, new InetSocketAddress(InetAddress.getByName("224.0.0.251"), 5353)));
                long end = System.currentTimeMillis() + waitMs;
                byte[] buf = new byte[9000];
                while (System.currentTimeMillis() < end) {
                    socket.setSoTimeout((int) Math.max(1, end - System.currentTimeMillis()));
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try {
                        socket.receive(p);
                    } catch (SocketTimeoutException e) {
                        break;
                    }
                    try {
                        out.addAll(parse(p.getData(), p.getLength(), p.getAddress().getHostAddress()));
                    } catch (RuntimeException ignored) {
                        // A malformed answer is skipped.
                    }
                }
            } catch (Exception ignored) {
                // No multicast on this interface: nothing to learn from it.
            }
        }
        return out;
    }

    /** A query with one PTR question per service type. */
    static byte[] query(String[] types) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.writeBytes(new byte[] { 0, 0, 0, 0, 0, (byte) types.length, 0, 0, 0, 0, 0, 0 });
        for (String t : types) {
            for (String label : (t + ".local").split("\\.")) {
                byte[] l = label.getBytes(StandardCharsets.UTF_8);
                b.write(l.length);
                b.writeBytes(l);
            }
            b.write(0);
            b.writeBytes(new byte[] { 0, 12, 0, 1 }); // PTR, IN
        }
        return b.toByteArray();
    }

    /** Reads PTR, SRV and A records out of a response and joins them into services. */
    static List<Service> parse(byte[] d, int len, String sourceIp) {
        int[] pos = { 12 };
        int qd = u16(d, 4), an = u16(d, 6), ns = u16(d, 8), ar = u16(d, 10);
        for (int i = 0; i < qd; i++) {
            name(d, len, pos);
            pos[0] += 4;
        }
        Map<String, String> ptr = new HashMap<>();     // instance -> type
        Map<String, int[]> srvPort = new HashMap<>();  // instance -> port
        Map<String, String> srvHost = new HashMap<>(); // instance -> host name
        Map<String, String> addr = new HashMap<>();    // host name -> IPv4
        for (int i = 0; i < an + ns + ar && pos[0] < len; i++) {
            String owner = name(d, len, pos);
            int type = u16(d, pos[0]);
            int rdlen = u16(d, pos[0] + 8);
            int rd = pos[0] + 10;
            pos[0] = rd + rdlen;
            if (pos[0] > len) break;
            int[] at = { rd };
            switch (type) {
                case 12 -> ptr.put(name(d, len, at), owner);
                case 33 -> {
                    srvPort.put(owner, new int[] { u16(d, rd + 4) });
                    at[0] = rd + 6;
                    srvHost.put(owner, name(d, len, at));
                }
                case 1 -> {
                    if (rdlen == 4) addr.put(owner, (d[rd] & 255) + "." + (d[rd + 1] & 255) + "." + (d[rd + 2] & 255) + "." + (d[rd + 3] & 255));
                }
                default -> { }
            }
        }
        List<Service> out = new ArrayList<>();
        ptr.forEach((instance, typeName) -> {
            if (!typeName.endsWith(".local") || !typeName.startsWith("_")) return;
            String type = typeName.substring(0, typeName.length() - ".local".length());
            int port = srvPort.containsKey(instance) ? srvPort.get(instance)[0] : 0;
            String host = srvHost.get(instance);
            String ip = host != null && addr.containsKey(host) ? addr.get(host) : sourceIp;
            String label = instance.endsWith("." + typeName) ? instance.substring(0, instance.length() - typeName.length() - 1) : instance;
            out.add(new Service(type, label, port, host == null ? null : host.replaceAll("\\.local$", ""), ip));
        });
        return out;
    }

    private static int u16(byte[] d, int i) {
        return ((d[i] & 255) << 8) | (d[i + 1] & 255);
    }

    /** A DNS name with compression pointers; moves pos past the name as written at pos. */
    static String name(byte[] d, int len, int[] pos) {
        StringBuilder sb = new StringBuilder();
        int p = pos[0];
        boolean jumped = false;
        for (int hops = 0; hops < 64 && p < len; hops++) {
            int l = d[p] & 255;
            if (l == 0) {
                p++;
                break;
            }
            if ((l & 0xC0) == 0xC0) {
                if (!jumped) pos[0] = p + 2;
                jumped = true;
                p = ((l & 0x3F) << 8) | (d[p + 1] & 255);
                continue;
            }
            if (sb.length() > 0) sb.append('.');
            sb.append(new String(d, p + 1, Math.min(l, len - p - 1), StandardCharsets.UTF_8));
            p += 1 + l;
        }
        if (!jumped) pos[0] = p;
        return sb.toString();
    }
}
