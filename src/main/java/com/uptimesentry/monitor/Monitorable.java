package com.uptimesentry.monitor;

/**
 * The Monitorable interface defines the contract for monitoring different types of targets
 * (HTTP services, network devices via ping, etc.). Implementations must provide methods
 * to check availability, retrieve response times, and execute recovery actions on failure.
 * 
 * The main application can work with a List<Monitorable>
 * without needing to know whether each target is an HttpMonitor or a PingMonitor.
 */
public interface Monitorable {
    
    /**
     * Performs the actual availability check (HTTP request or ICMP ping).
     * 
     * @return true if the target is available, false otherwise
     */
    boolean checkAvailability();
    
    /**
     * Returns the response time (in milliseconds) from the last availability check.
     * 
     * @return response time in milliseconds
     */
    long getResponseTime();
    
    /**
     * Returns the configured timeout for this target (in seconds).
     * A target is considered failed if it doesn't respond within this timeout.
     * 
     * @return timeout in seconds
     */
    int getTimeout();
    
    /**
     * Executes recovery actions when a failure is detected.
     * This could be: printing an alert, running a system command, or executing a script.
     */
    void executeRecovery();
}
