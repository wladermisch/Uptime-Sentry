package com.uptimesentry.monitor;

import java.net.HttpURLConnection;
import java.net.URL;

import com.uptimesentry.model.MonitoredTarget;

/**
 * HttpMonitor implements the Monitorable interface for HTTP-based monitoring.
 * It checks the availability of a web service by sending an HTTP request and
 * evaluating the response code.
 */
public class HttpMonitor implements Monitorable {
    
    private final MonitoredTarget target;
    private long lastResponseTime;
    
    /**
     * Constructor for creating an HttpMonitor.
     * * @param target the target configuration to monitor
     */
    public HttpMonitor(MonitoredTarget target) {
        this.target = target;
        this.lastResponseTime = 0;
    }
    
    /**
     * Checks the availability of an HTTP target by sending a request and checking
     * the response code. Returns true for success codes (e.g., 200), false for errors.
     * * @return true if available, false otherwise
     */
    @Override
    public boolean checkAvailability() {
        String host = target.getHost();
        int timeout = target.getTimeout();
        
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(host).openConnection();
            connection.setConnectTimeout(timeout * 1000); // converting to ms
            connection.setReadTimeout(timeout * 1000);
            
            long startTime = System.currentTimeMillis();
            
            // This line opens the connection and gets the status code simultaneously
            int responseCode = connection.getResponseCode();
            
            long endTime = System.currentTimeMillis();
            this.lastResponseTime = endTime - startTime;

            // If no custom list is configured, default to HTTP 200 as online.
            if (target.getAcceptableStatusCodes() == null || target.getAcceptableStatusCodes().isEmpty()) {
                return responseCode == 200;
            }

            // Check if returned code is in the list of acceptable ones.
            return target.getAcceptableStatusCodes().contains(responseCode);
            
        } catch (Exception e) {
            // Error connecting, timeout, bad URL format, etc.
            this.lastResponseTime = -1; // Indicate failure
            return false;
        }
    }
    
    /**
     * Returns the response time of the last check in milliseconds.
     * * @return response time in milliseconds
     */
    @Override
    public long getResponseTime() {
        return lastResponseTime;
    }
    
    /**
     * Returns the configured timeout for this target.
     * * @return timeout in seconds
     */
    @Override
    public int getTimeout() {
        return target.getTimeout();
    }
    
    /**
     * Executes recovery action on failure (e.g., print alert, run command).
     */
    @Override
    public void executeRecovery() {
        String recoveryAction = target.getRecoveryAction();

        if (recoveryAction == null || recoveryAction.trim().isEmpty()) {
            System.out.println("No recovery action configured for target: " + target.getName());
            return;
        }

        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            System.out.println("Recovery action for " + target.getName() + ": " + recoveryAction);

            try {
                // Wir splitten den Befehl auf: cmd.exe, /c, und die eigentliche Action
                ProcessBuilder pb = new ProcessBuilder("cmd", "/c", recoveryAction);
                pb.inheritIO();
                Process process = pb.start();
                int exitCode = process.waitFor();
                
                if (exitCode != 0) {
                    System.out.println("Process exited with error code: " + exitCode);
                }

            } catch (Exception e) {
                System.out.println("Failed to execute recovery action: " + e.getMessage());
            }
        }
    }
}