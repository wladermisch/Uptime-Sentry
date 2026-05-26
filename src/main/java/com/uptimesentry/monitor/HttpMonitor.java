package com.uptimesentry.monitor;

import com.uptimesentry.model.MonitoredTarget;

/**
 * HttpMonitor implements the Monitorable interface for HTTP-based monitoring.
 * It checks the availability of a web service by sending an HTTP request and
 * evaluating the response code.
 */
public class HttpMonitor implements Monitorable {
    
    private MonitoredTarget target;
    private long lastResponseTime;
    
    /**
     * Constructor for creating an HttpMonitor.
     * 
     * @param target the target configuration to monitor
     */
    public HttpMonitor(MonitoredTarget target) {
        this.target = target;
        this.lastResponseTime = 0;
    }
    
    /**
     * Checks the availability of an HTTP target by sending a request and checking
     * the response code. Returns true for success codes (e.g., 200), false for errors.
     * 
     * @return true if available, false otherwise
     */
    @Override
    public boolean checkAvailability() {
        // TODO: implement HTTP GET request using java.net.HttpURLConnection
        // - measure response time
        // - check for status codes (200 = success, 404/500 = failure)
        // - handle timeouts and connection errors
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
