package com.uptimesentry.model;

/**
 * CheckResult stores the outcome of a single monitoring check.
 * It contains the timestamp of the check, whether it was successful, the duration of the check.
 * When a check fails, durationMillis is set to -1, and the message can contain error details.
 *
 * The target's type, host and profile are copied into every result so reports can still
 * describe a target after it has been deleted. Older history entries don't have them (null).
 */
public class CheckResult {

    private final int targetId;
    private final String targetName;
    private final String timestamp;
    private final boolean success;
    private final long durationMillis;
    private final String message;
    private final String targetType;
    private final String host;
    private final String profileName;

    //Constructor for creating a new CheckResult
    public CheckResult(int targetId, String targetName, String timestamp, boolean success, long durationMillis, String message) {
        this(targetId, targetName, timestamp, success, durationMillis, message, null, null, null);
    }

    public CheckResult(int targetId, String targetName, String timestamp, boolean success, long durationMillis, String message,
                       String targetType, String host, String profileName) {
        this.targetId = targetId;
        this.targetName = targetName;
        this.timestamp = timestamp;
        this.success = success;
        this.durationMillis = durationMillis;
        this.message = message;
        this.targetType = targetType;
        this.host = host;
        this.profileName = profileName;
    }

    /** Result for a check of {@code target}, carrying its type, host and profile. */
    public static CheckResult of(MonitoredTarget target, String timestamp, boolean success, long durationMillis, String message) {
        return new CheckResult(target.getId(), target.getName(), timestamp, success, durationMillis, message,
            target.getType(), target.getHost(), target.getProfileName());
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

    public String getTargetType() {
        return targetType;
    }

    public String getHost() {
        return host;
    }

    public String getProfileName() {
        return profileName;
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
