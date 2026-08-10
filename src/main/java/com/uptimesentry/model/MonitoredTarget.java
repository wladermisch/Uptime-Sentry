package com.uptimesentry.model;

import java.util.List;

/**
 * MonitoredTarget represents a service or device being monitored.
 * This is the data model that stores configuration for a monitored target.
 * Subclasses will specify whether it's an HTTP target or a ping target.
 */
public class MonitoredTarget {
    
    private int id;
    private String name;
    private String type;              // HTTP or PING
    private String host;              // URL or hostname
    private int timeout;              // in seconds
    private String recoveryAction;    // command to execute on failure
    private List<Integer> acceptableStatusCodes; // for HTTP targets, e.g., [200, 201]
    private int consecutiveFailuresLimit = 1; // consecutive failures before alerting
    private String profileName; // name of the associated profile
    private String upSound;
    private String downSound;
    
    /**
     * Constructor for creating a new monitored target.
     */
    public MonitoredTarget(int id, String name, String type, String host, int timeout, String recoveryAction, List<Integer> acceptableStatusCodes) {
        this(id, name, type, host, timeout, recoveryAction, acceptableStatusCodes, 1, null);
    }

    /**
     * Overloaded constructor supporting failure threshold.
     */
    public MonitoredTarget(int id, String name, String type, String host, int timeout, String recoveryAction, List<Integer> acceptableStatusCodes, int consecutiveFailuresLimit) {
        this(id, name, type, host, timeout, recoveryAction, acceptableStatusCodes, consecutiveFailuresLimit, null);
    }

    /**
     * Overloaded constructor supporting failure threshold and profile.
     */
    public MonitoredTarget(int id, String name, String type, String host, int timeout, String recoveryAction, List<Integer> acceptableStatusCodes, int consecutiveFailuresLimit, String profileName) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.host = host;
        this.timeout = timeout;
        this.recoveryAction = recoveryAction;
        this.acceptableStatusCodes = acceptableStatusCodes;
        this.consecutiveFailuresLimit = consecutiveFailuresLimit;
        this.profileName = profileName;
    }
    
    // Getters and Setters
    public int getId() {
        return id;
    }
    
    public void setId(int id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }
    
    public String getHost() {
        return host;
    }
    
    public void setHost(String host) {
        this.host = host;
    }
    
    public int getTimeout() {
        return timeout;
    }
    
    public void setTimeout(int timeout) {
        this.timeout = timeout;
    }
    
    public String getRecoveryAction() {
        return recoveryAction;
    }
    
    public void setRecoveryAction(String recoveryAction) {
        this.recoveryAction = recoveryAction;
    }
    
    public List<Integer> getAcceptableStatusCodes() {
        return acceptableStatusCodes;
    }

    public void setAcceptableStatusCodes(List<Integer> acceptableStatusCodes) {
        this.acceptableStatusCodes = acceptableStatusCodes;
    }

    public int getConsecutiveFailuresLimit() {
        return consecutiveFailuresLimit <= 0 ? 1 : consecutiveFailuresLimit;
    }

    public void setConsecutiveFailuresLimit(int consecutiveFailuresLimit) {
        this.consecutiveFailuresLimit = consecutiveFailuresLimit;
    }

    public String getProfileName() {
        return profileName;
    }

    public void setProfileName(String profileName) {
        this.profileName = profileName;
    }

    public String getUpSound() {
        return upSound;
    }

    public void setUpSound(String upSound) {
        this.upSound = upSound;
    }

    public String getDownSound() {
        return downSound;
    }

    public void setDownSound(String downSound) {
        this.downSound = downSound;
    }

    // Provide a toString() method for easy logging and debugging
    @Override
    public String toString() {
        return "MonitoredTarget{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", type='" + type + '\'' +
                ", host='" + host + '\'' +
                ", timeout=" + timeout +
                ", recoveryAction='" + recoveryAction + '\'' +
                ", consecutiveFailuresLimit=" + consecutiveFailuresLimit +
                ", profileName='" + profileName + '\'' +
                '}';
    }
}
