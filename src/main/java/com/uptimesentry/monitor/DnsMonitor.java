package com.uptimesentry.monitor;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import com.uptimesentry.model.MonitoredTarget;

/**
 * Up when the name resolves through this computer's DNS, and, if expected addresses are set,
 * when the answer contains at least one of them (catches hijacked or stale records).
 */
public class DnsMonitor implements Monitorable {

    private final MonitoredTarget target;
    private long lastResponseTime;
    private String lastMessage;

    public DnsMonitor(MonitoredTarget target) {
        this.target = target;
    }

    @Override
    public boolean checkAvailability() {
        String name = Monitors.hostOf(target.getHost());
        int timeout = Math.max(1, target.getTimeout());
        if (name.isEmpty()) {
            lastResponseTime = -1;
            lastMessage = "No host name set";
            return false;
        }
        long start = System.nanoTime();
        InetAddress[] answer;
        try {
            answer = CompletableFuture.supplyAsync(() -> {
                try {
                    return InetAddress.getAllByName(name);
                } catch (UnknownHostException e) {
                    throw new IllegalStateException(e);
                }
            }).get(timeout, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            lastResponseTime = -1;
            lastMessage = "No DNS answer within " + timeout + " s";
            return false;
        } catch (Exception e) {
            lastResponseTime = -1;
            lastMessage = "Name not found: " + name;
            return false;
        }
        lastResponseTime = (System.nanoTime() - start) / 1_000_000;

        Set<String> got = new LinkedHashSet<>();
        for (InetAddress a : answer) got.add(a.getHostAddress());
        List<String> expected = expected();
        String list = String.join(", ", got);
        if (!expected.isEmpty() && expected.stream().noneMatch(got::contains)) {
            lastMessage = "Resolves to " + list + ", expected " + String.join(" or ", expected);
            return false;
        }
        lastMessage = "Resolves to " + list;
        return true;
    }

    private List<String> expected() {
        List<String> out = new ArrayList<>();
        String raw = target.getDnsExpected();
        if (raw == null) return out;
        for (String s : raw.split("[,;\\s]+")) {
            if (!s.isBlank()) out.add(s.trim());
        }
        return out;
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
