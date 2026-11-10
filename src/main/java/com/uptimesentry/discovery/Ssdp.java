package com.uptimesentry.discovery;

import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Asks the network once which UPnP devices are there (routers, TVs, media servers, printers) with
 * an SSDP M-SEARCH, then reads each device's own description for its name and model.
 */
public final class Ssdp {

    /** One device: its address, what it calls itself, and the raw text matched against signatures. */
    public record Device(String ip, String friendlyName, String model, String text) {
    }

    private static final Pattern TAG = Pattern.compile("<(friendlyName|manufacturer|modelName|modelDescription|deviceType)>([^<]{1,200})</", Pattern.CASE_INSENSITIVE);

    private Ssdp() {
    }

    public static List<Device> search(List<NetworkInterface> interfaces, int waitMs) {
        Map<String, StringBuilder> headers = new LinkedHashMap<>(); // ip -> collected headers
        Map<String, String> locations = new LinkedHashMap<>();
        byte[] msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n")
            .getBytes(StandardCharsets.US_ASCII);
        for (NetworkInterface ni : interfaces) {
            try (MulticastSocket socket = new MulticastSocket(0)) {
                socket.setNetworkInterface(ni);
                socket.setTimeToLive(2);
                socket.send(new DatagramPacket(msg, msg.length, new InetSocketAddress(InetAddress.getByName("239.255.255.250"), 1900)));
                long end = System.currentTimeMillis() + waitMs;
                byte[] buf = new byte[4096];
                while (System.currentTimeMillis() < end) {
                    socket.setSoTimeout((int) Math.max(1, end - System.currentTimeMillis()));
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try {
                        socket.receive(p);
                    } catch (SocketTimeoutException e) {
                        break;
                    }
                    String ip = p.getAddress().getHostAddress();
                    if (!Networks.isPrivate(ip)) continue;
                    String text = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                    StringBuilder sb = headers.computeIfAbsent(ip, k -> new StringBuilder());
                    for (String line : text.split("\r?\n")) {
                        String l = line.toLowerCase(Locale.ROOT);
                        if (l.startsWith("server:") || l.startsWith("st:")) sb.append(line.substring(line.indexOf(':') + 1).trim()).append(' ');
                        if (l.startsWith("location:") && !locations.containsKey(ip)) locations.put(ip, line.substring(line.indexOf(':') + 1).trim());
                    }
                }
            } catch (Exception ignored) {
                // No multicast on this interface.
            }
        }
        List<Device> out = new ArrayList<>();
        headers.forEach((ip, h) -> {
            String friendly = null;
            String model = null;
            StringBuilder text = new StringBuilder(h);
            String loc = locations.get(ip);
            if (loc != null) {
                String xml = fetchDescription(loc, ip);
                if (xml != null) {
                    Matcher m = TAG.matcher(xml);
                    while (m.find()) {
                        String tag = m.group(1).toLowerCase(Locale.ROOT);
                        String v = m.group(2).trim();
                        text.append(v).append(' ');
                        if (tag.equals("friendlyname") && friendly == null) friendly = v;
                        if (tag.equals("modelname") && model == null) model = v;
                    }
                }
            }
            out.add(new Device(ip, friendly, model, text.toString()));
        });
        return out;
    }

    /** The device's description XML, only from the address that announced it, at most 64 KB. */
    private static String fetchDescription(String location, String ip) {
        try {
            URI uri = URI.create(location);
            if (uri.getHost() == null || !uri.getHost().equals(ip) || !"http".equalsIgnoreCase(uri.getScheme())) return null;
            HttpURLConnection c = (HttpURLConnection) uri.toURL().openConnection();
            c.setConnectTimeout(1500);
            c.setReadTimeout(1500);
            c.setInstanceFollowRedirects(false);
            try (InputStream in = c.getInputStream()) {
                return new String(in.readNBytes(64 * 1024), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            return null;
        }
    }
}
