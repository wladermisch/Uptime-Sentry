package com.uptimesentry.discovery;

import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The networks discovery may look at: this computer's private IPv4 networks, each limited to the
 * /24 around its own address. Public addresses are never touched.
 */
public final class Networks {

    /** A local network: the interface, this computer's address on it, and its /24 ("192.168.1"). */
    public record Local(String id, String name, String address, String prefix, boolean virtual, NetworkInterface nic) {
        public String range() {
            return prefix + ".1 to " + prefix + ".254";
        }
    }

    private static final Pattern IPV4 = Pattern.compile("\\b(\\d{1,3}(?:\\.\\d{1,3}){3})\\b");
    private static final Pattern MAC = Pattern.compile("\\b([0-9a-f]{2}[-:]){5}[0-9a-f]{2}\\b", Pattern.CASE_INSENSITIVE);

    private Networks() {
    }

    /** 10/8, 172.16/12 and 192.168/16 only. */
    public static boolean isPrivate(String ip) {
        int[] o = octets(ip);
        if (o == null) return false;
        return o[0] == 10 || (o[0] == 172 && o[1] >= 16 && o[1] <= 31) || (o[0] == 192 && o[1] == 168);
    }

    static int[] octets(String ip) {
        if (ip == null) return null;
        String[] p = ip.trim().split("\\.");
        if (p.length != 4) return null;
        int[] o = new int[4];
        try {
            for (int i = 0; i < 4; i++) {
                o[i] = Integer.parseInt(p[i]);
                if (o[i] < 0 || o[i] > 255) return null;
            }
        } catch (NumberFormatException e) {
            return null;
        }
        return o;
    }

    public static List<Local> local() {
        List<Local> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isPointToPoint()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (!(a instanceof Inet4Address)) continue;
                    String ip = a.getHostAddress();
                    if (!isPrivate(ip)) continue;
                    String name = ni.getDisplayName() == null ? ni.getName() : ni.getDisplayName();
                    String n = name.toLowerCase(Locale.ROOT);
                    // Hyper-V, WSL, Docker, VirtualBox and VMware adapters lead to virtual machines, not the home network.
                    boolean virtual = ni.isVirtual() || n.contains("vethernet") || n.contains("hyper-v") || n.contains("virtualbox")
                        || n.contains("vmware") || n.contains("docker") || n.contains("wsl") || n.contains("tailscale") || n.contains("zerotier");
                    String prefix = ip.substring(0, ip.lastIndexOf('.'));
                    out.add(new Local(ni.getName() + "/" + prefix, name, ip, prefix, virtual, ni));
                }
            }
        } catch (Exception e) {
            // No interfaces readable: nothing to offer.
        }
        return out;
    }

    /** Addresses this computer already knows on the given /24s, from its ARP cache. */
    public static Set<String> neighbours(Set<String> prefixes) {
        Set<String> out = new LinkedHashSet<>();
        try {
            Process p = new ProcessBuilder("arp", "-a").redirectErrorStream(true).start();
            String text;
            try (InputStream in = p.getInputStream()) {
                text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            p.waitFor(5, TimeUnit.SECONDS);
            for (String line : text.split("\r?\n")) {
                Matcher ip = IPV4.matcher(line);
                Matcher mac = MAC.matcher(line);
                if (!ip.find() || !mac.find()) continue;
                String a = ip.group(1);
                String m = mac.group().toLowerCase(Locale.ROOT);
                if (m.startsWith("ff") || m.startsWith("01-00-5e") || m.startsWith("01:00:5e")) continue;
                int[] o = octets(a);
                if (o == null || o[3] == 0 || o[3] == 255) continue;
                if (prefixes.contains(o[0] + "." + o[1] + "." + o[2])) out.add(a);
            }
        } catch (Exception e) {
            // No arp command: the sweep still covers the range.
        }
        return out;
    }
}
