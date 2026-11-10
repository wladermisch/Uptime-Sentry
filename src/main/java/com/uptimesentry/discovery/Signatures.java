package com.uptimesentry.discovery;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.google.gson.Gson;

/**
 * The small, editable database of what a service looks like (discovery/signatures.json):
 * names matched against a page title, Server header, certificate name, mDNS type or SSDP text.
 */
public final class Signatures {

    public static class Signature {
        public String name;
        public String check = "TCP";
        public List<Integer> ports = new ArrayList<>();
        public List<String> title = new ArrayList<>();
        public List<String> server = new ArrayList<>();
        public List<String> mdns = new ArrayList<>();
        public List<String> ssdp = new ArrayList<>();
    }

    private static class File {
        List<Signature> signatures = new ArrayList<>();
    }

    /** A match and how sure it is: IDENTIFIED from what the service says, LIKELY from its port alone. */
    public record Match(Signature signature, String confidence) {
    }

    private static List<Signature> all;

    private Signatures() {
    }

    public static synchronized List<Signature> all() {
        if (all == null) {
            try (InputStream in = Signatures.class.getResourceAsStream("/discovery/signatures.json")) {
                File f = in == null ? null : new Gson().fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), File.class);
                all = f == null || f.signatures == null ? List.of() : f.signatures;
            } catch (Exception e) {
                all = List.of();
            }
        }
        return all;
    }

    private static boolean has(List<String> needles, String hay) {
        if (needles == null || hay == null || hay.isBlank()) return false;
        String h = hay.toLowerCase(Locale.ROOT);
        return needles.stream().anyMatch(n -> !n.isBlank() && h.contains(n.toLowerCase(Locale.ROOT)));
    }

    /** What a web page or open port is, from what it answered (any field may be null). */
    public static Match forService(int port, String title, String server, String certName) {
        // What the service says about itself wins over what its port suggests.
        for (Signature s : all()) {
            if (has(s.title, title) || has(s.title, certName) || has(s.server, server)) return new Match(s, "IDENTIFIED");
        }
        for (Signature s : all()) {
            if (s.ports != null && s.ports.contains(port) && s.title.isEmpty() && s.server.isEmpty()) return new Match(s, "LIKELY");
        }
        for (Signature s : all()) {
            if (s.ports != null && s.ports.contains(port)) return new Match(s, "LIKELY");
        }
        return null;
    }

    /** An mDNS service type such as "_ipp._tcp". */
    public static Match forMdns(String type, String instanceName) {
        for (Signature s : all()) {
            if (has(s.title, instanceName)) return new Match(s, "IDENTIFIED");
        }
        for (Signature s : all()) {
            if (s.mdns != null && s.mdns.stream().anyMatch(m -> type != null && type.toLowerCase(Locale.ROOT).startsWith(m))) return new Match(s, "IDENTIFIED");
        }
        return null;
    }

    /** An SSDP announcement: its SERVER/ST headers and, when fetched, the device description. */
    public static Match forSsdp(String text) {
        for (Signature s : all()) {
            if (has(s.ssdp, text) || has(s.title, text)) return new Match(s, "IDENTIFIED");
        }
        return null;
    }
}
