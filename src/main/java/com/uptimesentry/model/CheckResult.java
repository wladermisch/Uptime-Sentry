package com.uptimesentry.model;

import java.time.LocalDateTime;

/**
 * CheckResult stores the outcome of a single monitoring check.
 * 
 * When a check fails, durationMillis is set to -1, and the message can contain error details.
 */
public class CheckResult {
    
    private final LocalDateTime timestamp;
    private final boolean success;
    private final long durationMillis;
    private final String message;
    
    //Constructor for creating a new CheckResult
    public CheckResult(LocalDateTime timestamp, boolean success, long durationMillis, String message) {
        this.timestamp = timestamp;
        this.success = success;
        this.durationMillis = durationMillis;
        this.message = message;
    }
    
    // Getters (no setters, since only CheckResult)
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
    
    //Provide a toString() method for easy logging and debugging
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
