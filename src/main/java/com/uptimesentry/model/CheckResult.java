package com.uptimesentry.model;

import java.time.LocalDateTime;

/**
 * CheckResult stores the outcome of a single monitoring check.
 * This is an immutable value object used in collections for history/reporting.
 */
public class CheckResult {
    
    private final LocalDateTime timestamp;
    private final boolean success;
    private final long durationMillis;
    private final String message;
    
    /**
     * Constructor for creating a check result.
     */
    public CheckResult(LocalDateTime timestamp, boolean success, long durationMillis, String message) {
        this.timestamp = timestamp;
        this.success = success;
        this.durationMillis = durationMillis;
        this.message = message;
    }
    
    // Getters (immutable, no setters)
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public boolean isSuccess() {
        return success;
    }
    
    public long getDurationMillis() {
        return durationMillis;
    }
    
    public String getMessage() {
        return message;
    }
    
    /**
     * Provides a readable overview of the check result.
     */
    @Override
    public String toString() {
        return "CheckResult{" +
                "timestamp=" + timestamp +
                ", success=" + success +
                ", durationMillis=" + durationMillis +
                ", message='" + message + '\'' +
                '}';
    }
}
