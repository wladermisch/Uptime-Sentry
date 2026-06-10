package com.uptimesentry.exception;

/**
 * Own exception class for monitoring-related errors.
 * Thrown when a monitoring error occurs (e.g., network failure, timeout).
 * Allows the application to distinguish monitoring errors from other exceptions.
 */
public class MonitoringException extends Exception {
    
    public MonitoringException(String message) {
        super(message);
    }
    
    public MonitoringException(String message, Throwable cause) {
        super(message, cause);
    }
}
