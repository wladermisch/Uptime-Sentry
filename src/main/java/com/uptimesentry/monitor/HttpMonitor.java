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

            boolean codeAcceptable;
            if (target.getAcceptableStatusCodes() == null || target.getAcceptableStatusCodes().isEmpty()) {
                codeAcceptable = (responseCode >= 200 && responseCode < 300);
            } else {
                codeAcceptable = target.getAcceptableStatusCodes().contains(responseCode);
            }

            if (!codeAcceptable) {
                return false;
            }

            // Keyword content matching check
            String rule = target.getKeywordRule();
            String kw = target.getKeyword();

            if (kw != null && !kw.trim().isEmpty() && !"DISABLED".equalsIgnoreCase(rule)) {
                try {
                    java.io.InputStream is = (responseCode >= 400) ? connection.getErrorStream() : connection.getInputStream();
                    if (is != null) {
                        String body = new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
                        if ("MUST_CONTAIN".equalsIgnoreCase(rule)) {
                            if (!body.contains(kw)) {
                                return false;
                            }
                        } else if ("MUST_NOT_CONTAIN".equalsIgnoreCase(rule)) {
                            if (body.contains(kw)) {
                                return false;
                            }
                        }
                    }
                } catch (Exception kwEx) {
                    return false;
                }
            }

            return true;
            
        } catch (Exception e) {
            // Error connecting, timeout, bad URL format, etc.
            this.lastResponseTime = -1; // Indicate failure
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
    
    /**
     * Executes recovery action on failure (e.g., print alert, run command).
     * With ProcessBuilder.
     * WARNING: Security Vulnerability due to external commands being executed. should be withelisted in the future.
     * targets.json can be abused to execute harmful commands.
     * Only works on Windows for now, since ProcessBuilder is used with "cmd /c". For cross-platform support, this would need to be adapted.
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
                // Split the command into parts for ProcessBuilder, so it gets executed properly (e.g., "cmd /c yourcommand")
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