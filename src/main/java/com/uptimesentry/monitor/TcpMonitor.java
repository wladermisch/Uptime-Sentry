package com.uptimesentry.monitor;

import java.net.InetSocketAddress;
import java.net.Socket;

import com.uptimesentry.model.MonitoredTarget;

/** Up when a TCP connection to host:port opens within the timeout (databases, mail, SSH, game servers…). */
public class TcpMonitor implements Monitorable {

    private final MonitoredTarget target;
    private long lastResponseTime;
    private String lastMessage;

    public TcpMonitor(MonitoredTarget target) {
        this.target = target;
    }

    @Override
    public boolean checkAvailability() {
        String host = Monitors.hostOf(target.getHost());
        int port = Monitors.portOf(target, -1);
        int timeout = Math.max(1, target.getTimeout());
        if (host.isEmpty() || port <= 0) {
            lastResponseTime = -1;
            lastMessage = "No port set (enter it in the Port field or as host:port)";
            return false;
        }
        long start = System.nanoTime();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), timeout * 1000);
            lastResponseTime = (System.nanoTime() - start) / 1_000_000;
            lastMessage = "Port " + port + " open, connected in " + lastResponseTime + " ms";
            return true;
        } catch (Exception e) {
            lastResponseTime = -1;
            lastMessage = "Port " + port + ": " + HttpMonitor.describe(e, timeout);
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
