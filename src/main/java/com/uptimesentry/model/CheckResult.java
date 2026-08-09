package com.uptimesentry.model;

/**
 * CheckResult stores the outcome of a single monitoring check.
 * It contains the timestamp of the check, whether it was successful, the duration of the check.
 * When a check fails, durationMillis is set to -1, and the message can contain error details.
 */
public class CheckResult {
    
    private final int targetId;
    private final String targetName;
    private final String timestamp;
    private final boolean success;
    private final long durationMillis;
    private final String message;
    
    //Constructor for creating a new CheckResult
    public CheckResult(int targetId, String targetName, String timestamp, boolean success, long durationMillis, String message) {
        this.targetId = targetId;
        this.targetName = targetName;
        this.timestamp = timestamp;
        this.success = success;
        this.durationMillis = durationMillis;
        this.message = message;
    }
    
    // Getters (no setters, since only CheckResult)
    public int getTargetId() {
        return targetId;
    }

    public String getTargetName() {
        return targetName;
    }

    public String getTimestamp() {
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
                "targetId=" + targetId +
                ", targetName='" + targetName + '\'' +
                ", timestamp='" + timestamp + '\'' +
                ", success=" + success +
                ", durationMillis=" + durationMillis +
                ", message='" + message + '\'' +
                '}';
    }
}
