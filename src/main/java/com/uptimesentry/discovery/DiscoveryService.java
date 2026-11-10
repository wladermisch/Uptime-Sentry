package com.uptimesentry.discovery;

import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import com.uptimesentry.util.SentryLogger;

/**
 * Finds services on this computer's own networks, only when the person starts it:
 *
 * 1. Listens for devices that announce themselves (mDNS and SSDP). This sends two queries, no scan.
 * 2. Only if asked: finds which addresses on the /24 answer, then knocks on a short list of
 *    well-known ports on those, a few at a time, and reads the page title of web services.
 *
 * It never touches a public address, never runs in the background, and adds nothing on its own:
 * the results are suggestions the person picks from.
 */
public class DiscoveryService {

    /** Common service ports; never a full port scan. */
    public static final int[] PORTS = {
        22, 53, 80, 443, 445, 631, 1880, 1883, 3000, 3001, 3306, 3389, 5000, 5001, 5432, 5900,
        6379, 8006, 8008, 8080, 8081, 8096, 8123, 8443, 8883, 9000, 9090, 9100, 9443, 25565, 27017, 32400,
    };
    private static final Set<Integer> HTTPS = Set.of(443, 5001, 8006, 8443, 9443);
    private static final Set<Integer> HTTP = Set.of(80, 1880, 3000, 3001, 5000, 8080, 8081, 8096, 8123, 9000, 9090, 32400);
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>([^<]{1,160})</title>", Pattern.CASE_INSENSITIVE);
    private static final int CONNECT_MS = 600;
    private static final int SWEEP_MS = 300;
    private static final int PARALLEL = 32;

    public static class FoundService {
        public int port;
        public String name;
        /** IDENTIFIED, LIKELY or UNKNOWN. */
        public String confidence;
        /** mDNS, SSDP or port. */
        public String source;
        /** HTTP, TCP or PING: the target type to suggest. */
        public String check;
        public String suggestedHost;
        public String detail;
    }

    public static class Device {
        public String ip;
        public String hostname;
        public List<FoundService> services = new ArrayList<>();
    }

    public static class Status {
        public boolean running;
        public boolean active;
        public String phase = "idle";
        public double progress;
        public String message;
        public List<String> networks = new ArrayList<>();
        public List<Device> devices = new ArrayList<>();
        public String startedAt;
        public String finishedAt;
        public boolean cancelled;
        public String error;
    }

    private volatile Status status = new Status();
    private volatile boolean cancel;
    private Thread worker;

    public synchronized Status status() {
        return status;
    }

    /** Starts a run on the given local networks; false when one is already running. */
    public synchronized boolean start(List<Networks.Local> networks, boolean checkPorts) {
        if (status.running) return false;
        Status s = new Status();
        s.running = true;
        s.active = checkPorts;
        s.phase = "listening";
        s.message = "Listening for devices that announce themselves";
        s.startedAt = now();
        networks.forEach(n -> s.networks.add(n.prefix() + ".0/24"));
        status = s;
        cancel = false;
        worker = new Thread(() -> run(s, networks, checkPorts), "network-discovery");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    public synchronized void cancel() {
        if (!status.running) return;
        cancel = true;
        if (worker != null) worker.interrupt();
    }

    private static String now() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private void run(Status s, List<Networks.Local> networks, boolean checkPorts) {
        SentryLogger.info("Network discovery started on " + String.join(", ", s.networks) + (checkPorts ? " (announcements and common ports)" : " (announcements only)"));
        Map<String, Device> devices = new LinkedHashMap<>();
        Set<String> prefixes = new LinkedHashSet<>();
        networks.forEach(n -> prefixes.add(n.prefix()));
        List<NetworkInterface> nics = networks.stream().map(Networks.Local::nic).distinct().toList();
        try {
            // 1. Announcements: mDNS and SSDP, about three seconds.
            for (Mdns.Service m : Mdns.browse(nics, 2500)) {
                if (!inScope(m.ip(), prefixes)) continue;
                Device d = devices.computeIfAbsent(m.ip(), this::device);
                if (m.host() != null && d.hostname == null) d.hostname = m.host();
                Signatures.Match match = Signatures.forMdns(m.type(), m.instance());
                String check = match != null ? match.signature().check : (m.port() > 0 ? "TCP" : "PING");
                add(d, m.port(), match != null ? match.signature().name : m.instance(), match != null ? match.confidence() : "UNKNOWN",
                    "mDNS", check, m.instance());
            }
            s.progress = 0.08;
            if (cancel) throw new InterruptedException();
            for (Ssdp.Device u : Ssdp.search(nics, 2500)) {
                if (!inScope(u.ip(), prefixes)) continue;
                Device d = devices.computeIfAbsent(u.ip(), this::device);
                Signatures.Match match = Signatures.forSsdp(u.text());
                String name = match != null ? match.signature().name : (u.friendlyName() != null ? u.friendlyName() : "UPnP device");
                String detail = u.friendlyName() != null ? u.friendlyName() + (u.model() != null && !u.friendlyName().contains(u.model()) ? ", " + u.model() : "") : u.model();
                add(d, 0, name, match != null ? match.confidence() : "UNKNOWN", "SSDP", match != null ? match.signature().check : "PING", detail);
            }
            s.progress = 0.15;
            s.devices = snapshot(devices);

            if (checkPorts) {
                // 2. Which addresses are there: one quick knock each, which also fills the ARP cache.
                s.phase = "sweeping";
                s.message = "Finding devices on " + String.join(", ", s.networks);
                Set<String> alive = new LinkedHashSet<>(devices.keySet());
                networks.forEach(n -> alive.add(n.address()));
                List<String> range = new ArrayList<>();
                for (String p : prefixes) for (int i = 1; i <= 254; i++) range.add(p + "." + i);
                AtomicInteger done = new AtomicInteger();
                runAll(range, ip -> {
                    if (answers(ip, 80, SWEEP_MS)) synchronized (alive) { alive.add(ip); }
                    s.progress = 0.15 + 0.25 * done.incrementAndGet() / range.size();
                });
                alive.addAll(Networks.neighbours(prefixes));
                if (cancel) throw new InterruptedException();

                // 3. The common ports on the addresses that are there.
                s.phase = "ports";
                s.message = "Checking common ports on " + alive.size() + (alive.size() == 1 ? " device" : " devices");
                List<String[]> jobs = new ArrayList<>();
                for (String ip : alive) for (int port : PORTS) jobs.add(new String[] { ip, String.valueOf(port) });
                AtomicInteger checked = new AtomicInteger();
                Map<String, List<Integer>> open = new LinkedHashMap<>();
                runAll(jobs, j -> {
                    if (open(j[0], Integer.parseInt(j[1]))) synchronized (open) { open.computeIfAbsent(j[0], k -> new ArrayList<>()).add(Integer.parseInt(j[1])); }
                    s.progress = 0.4 + 0.45 * checked.incrementAndGet() / Math.max(1, jobs.size());
                });
                if (cancel) throw new InterruptedException();

                // 4. What each open port is: the page title of web services, else the port's usual service.
                s.phase = "identifying";
                s.message = "Recognising what answered";
                List<String[]> found = new ArrayList<>();
                open.forEach((ip, ports) -> ports.forEach(p -> found.add(new String[] { ip, String.valueOf(p) })));
                AtomicInteger named = new AtomicInteger();
                Map<String, FoundService> byKey = new LinkedHashMap<>();
                runAll(found, f -> {
                    FoundService svc = identify(f[0], Integer.parseInt(f[1]));
                    synchronized (byKey) { byKey.put(f[0] + ":" + f[1], svc); }
                    s.progress = 0.85 + 0.1 * named.incrementAndGet() / Math.max(1, found.size());
                });
                byKey.forEach((key, svc) -> {
                    String ip = key.substring(0, key.lastIndexOf(':'));
                    Device d = devices.computeIfAbsent(ip, this::device);
                    // An announcement for the same port already named it; keep the better of the two.
                    FoundService same = d.services.stream().filter(x -> x.port == svc.port).findFirst().orElse(null);
                    if (same == null) d.services.add(svc);
                    else if (!"IDENTIFIED".equals(same.confidence) && "IDENTIFIED".equals(svc.confidence)) {
                        d.services.remove(same);
                        d.services.add(svc);
                    }
                });
            }

            // Host names, where the network knows them (each lookup capped at 1.5 s).
            s.phase = "naming";
            s.message = "Looking up device names";
            resolveNames(devices.values());
            s.devices = snapshot(devices);
            s.progress = 1;
            s.phase = "done";
            int services = s.devices.stream().mapToInt(d -> d.services.size()).sum();
            s.message = "Found " + services + (services == 1 ? " service" : " services") + " on " + s.devices.size() + (s.devices.size() == 1 ? " device." : " devices.");
            SentryLogger.info("Network discovery finished: " + s.message);
        } catch (InterruptedException e) {
            s.cancelled = true;
            s.phase = "cancelled";
            s.devices = snapshot(devices);
            s.message = "Stopped. Showing what was found so far.";
            SentryLogger.info("Network discovery stopped by the user.");
        } catch (Exception e) {
            s.error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            s.phase = "failed";
            s.devices = snapshot(devices);
            SentryLogger.error("Network discovery failed: " + s.error);
        } finally {
            s.finishedAt = now();
            s.running = false;
        }
    }

    private Device device(String ip) {
        Device d = new Device();
        d.ip = ip;
        return d;
    }

    private static boolean inScope(String ip, Set<String> prefixes) {
        if (!Networks.isPrivate(ip)) return false;
        return prefixes.contains(ip.substring(0, ip.lastIndexOf('.')));
    }

    private static void add(Device d, int port, String name, String confidence, String source, String check, String detail) {
        // The same service announced twice (mDNS and SSDP, or two mDNS types) is one suggestion.
        if (d.services.stream().anyMatch(x -> x.name.equals(name) && (x.port == port || port == 0 || x.port == 0 || "PING".equals(check)))) return;
        FoundService f = new FoundService();
        f.port = port;
        f.name = name;
        f.confidence = confidence;
        f.source = source;
        f.check = port == 0 && !"PING".equals(check) ? "PING" : check;
        f.suggestedHost = suggestHost(d.ip, port, f.check);
        f.detail = detail;
        d.services.add(f);
    }

    static String suggestHost(String ip, int port, String check) {
        if ("HTTP".equals(check)) {
            boolean tls = HTTPS.contains(port);
            boolean standard = (tls && port == 443) || (!tls && port == 80) || port == 0;
            return (tls ? "https://" : "http://") + ip + (standard ? "" : ":" + port);
        }
        return ip;
    }

    private static List<Device> snapshot(Map<String, Device> devices) {
        List<Device> list = new ArrayList<>(devices.values());
        for (Device d : list) d.services.sort(Comparator.comparingInt(x -> x.port == 0 ? Integer.MAX_VALUE : x.port));
        list.sort(Comparator.comparingLong(d -> {
            int[] o = Networks.octets(d.ip);
            return o == null ? Long.MAX_VALUE : ((long) o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3];
        }));
        return list;
    }

    private interface Job<T> {
        void run(T item) throws Exception;
    }

    /** Runs the jobs a few at a time, stopping early when cancelled. */
    private <T> void runAll(List<T> items, Job<T> job) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(PARALLEL, r -> {
            Thread t = new Thread(r, "discovery-probe");
            t.setDaemon(true);
            return t;
        });
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (T item : items) {
                futures.add(pool.submit(() -> {
                    if (cancel) return null;
                    job.run(item);
                    return null;
                }));
            }
            for (Future<?> f : futures) {
                if (cancel) throw new InterruptedException();
                try {
                    f.get();
                } catch (java.util.concurrent.ExecutionException ignored) {
                    // One failed probe says nothing about the rest.
                }
            }
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    /** True when something is at the address: the port opened, or the host refused it at once. */
    private static boolean answers(String ip, int port, int timeoutMs) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(ip, port), timeoutMs);
            return true;
        } catch (ConnectException e) {
            return true; // Refused: a host is there.
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean open(String ip, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(ip, port), CONNECT_MS);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Names an open port: a web service by what its page says, anything else by its usual use. */
    private static FoundService identify(String ip, int port) {
        String title = null, server = null, cert = null;
        boolean web = HTTP.contains(port) || HTTPS.contains(port);
        boolean tls = HTTPS.contains(port);
        if (web) {
            String[] r = readPage(ip, port, tls);
            if (r == null && !tls) {
                r = readPage(ip, port, true);
                if (r != null) tls = true;
            }
            if (r != null) {
                title = r[0];
                server = r[1];
                cert = r[2];
            }
        }
        Signatures.Match match = Signatures.forService(port, title, server, cert);
        FoundService f = new FoundService();
        f.port = port;
        f.source = "port";
        if (match != null) {
            f.name = match.signature().name;
            f.confidence = match.confidence();
            f.check = match.signature().check;
        } else {
            f.name = title != null ? title : "Service on port " + port;
            f.confidence = title != null ? "IDENTIFIED" : "UNKNOWN";
            f.check = web ? "HTTP" : "TCP";
        }
        // A web service is checked as a page even when only its port told us what it is.
        if (web && title != null) f.check = "HTTP";
        f.detail = title != null ? title : server;
        // HTTPS on a home network almost always has its own certificate, which a page check would
        // reject as untrusted. Watch the port instead, so the target doesn't start out down.
        if (tls && "HTTP".equals(f.check)) {
            f.check = "TCP";
            f.detail = (f.detail == null ? "" : f.detail + ". ") + "HTTPS with its own certificate, checked as an open port";
        }
        f.suggestedHost = suggestHost(ip, port, f.check);
        return f;
    }

    /** [title, Server header, certificate name] of the start page, or null when nothing answered. */
    private static String[] readPage(String ip, int port, boolean tls) {
        try {
            HttpURLConnection c = (HttpURLConnection) URI.create((tls ? "https://" : "http://") + ip + ":" + port + "/").toURL().openConnection();
            c.setConnectTimeout(1500);
            c.setReadTimeout(2000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("User-Agent", "UptimeSentry-Discovery");
            String cert = null;
            if (c instanceof HttpsURLConnection h) {
                // Only to read what a local device calls itself: home devices use self-signed certificates.
                // Monitoring itself always verifies certificates.
                h.setSSLSocketFactory(TRUST_ALL.getSocketFactory());
                h.setHostnameVerifier((host, session) -> true);
            }
            int code = c.getResponseCode();
            if (c instanceof HttpsURLConnection h) {
                try {
                    if (h.getServerCertificates().length > 0 && h.getServerCertificates()[0] instanceof X509Certificate x) {
                        cert = x.getSubjectX500Principal().getName();
                    }
                } catch (Exception ignored) {
                    // No certificate to read.
                }
            }
            String body = "";
            try (InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream()) {
                if (in != null) body = new String(in.readNBytes(64 * 1024), StandardCharsets.UTF_8);
            }
            Matcher m = TITLE.matcher(body);
            String title = m.find() ? m.group(1).replaceAll("\\s+", " ").trim() : null;
            if (title != null && title.isEmpty()) title = null;
            return new String[] { title, c.getHeaderField("Server"), cert };
        } catch (Exception e) {
            return null;
        }
    }

    private static final SSLContext TRUST_ALL = trustAll();

    private static SSLContext trustAll() {
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) { }
                public void checkServerTrusted(X509Certificate[] c, String a) { }
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            } }, null);
            return ctx;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void resolveNames(java.util.Collection<Device> devices) {
        ExecutorService pool = Executors.newFixedThreadPool(16, r -> {
            Thread t = new Thread(r, "discovery-names");
            t.setDaemon(true);
            return t;
        });
        try {
            List<CompletableFuture<Void>> all = new ArrayList<>();
            for (Device d : devices) {
                if (d.hostname != null) continue;
                all.add(CompletableFuture.runAsync(() -> {
                    try {
                        String n = InetAddress.getByName(d.ip).getCanonicalHostName();
                        if (n != null && !n.equals(d.ip)) d.hostname = n.replaceAll("\\.(local|lan|home|fritz\\.box|localdomain)$", "");
                    } catch (Exception ignored) {
                        // No name known.
                    }
                }, pool).completeOnTimeout(null, 1500, TimeUnit.MILLISECONDS));
            }
            CompletableFuture.allOf(all.toArray(new CompletableFuture[0])).get(4, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            // Names are a nicety.
        } finally {
            pool.shutdownNow();
        }
    }
}
