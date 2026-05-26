package com.uptimesentry.monitor;

import com.uptimesentry.model.MonitoredTarget;

/**
 * PingMonitor implements the Monitorable interface for ICMP ping-based monitoring.
 * It checks the availability of a network device (host, router, NAS, etc.) by
 * sending ICMP ping requests.
 */
public class PingMonitor implements Monitorable {
    
    private MonitoredTarget target;
    private long lastResponseTime;
    
    /**
     * Constructor for creating a PingMonitor.
     * 
     * @param target the target configuration to monitor
     */
    public PingMonitor(MonitoredTarget target) {
        this.target = target;
        this.lastResponseTime = 0;
    }
    
    /**
     * Checks the availability of a network target by sending ICMP ping requests.
     * Returns true if the host responds within the timeout, false otherwise.
     * 
     * @return true if available, false otherwise
     */
    @Override
    public boolean checkAvailability() {
        // TODO: implement ICMP ping using java.net.InetAddress.getByName().isReachable()
        // - measure response time
        // - respect the configured timeout
        // - handle network errors gracefully
        return false;
    }
    
    /**
     * Returns the response time of the last check in milliseconds.
     * 
     * @return response time in milliseconds
     */
    @Override
    public long getResponseTime() {
        // TODO: return the response time from the last check
        return lastResponseTime;
    }
    
    /**
     * Returns the configured timeout for this target.
     * 
     * @return timeout in seconds
     */
    @Override
    public int getTimeout() {
        // TODO: return target.getTimeout()
        return 0;
    }
    
    /**
     * Executes recovery action on failure (e.g., print alert, run command).
     */
    @Override
    public void executeRecovery() {
        // TODO: execute recovery action from target.getRecoveryAction()
        // - could be: run a system command, print alert, or execute a script
    }
}
