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
    private String host;              // URL or hostname
    private int timeout;              // in seconds
    private String recoveryAction;    // command to execute on failure
    private List<Integer> acceptableStatusCodes; // for HTTP targets, e.g., [200, 201]
    
    /**
     * Constructor for creating a new monitored target.
     */
    public MonitoredTarget(int id, String name, String host, int timeout, String recoveryAction) {
        this.id = id;
        this.name = name;
        this.host = host;
        this.timeout = timeout;
        this.recoveryAction = recoveryAction;
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

    /**
     * Provides a readable overview of the target's attributes.
     */
    @Override
    public String toString() {
        return "MonitoredTarget{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", host='" + host + '\'' +
                ", timeout=" + timeout +
                ", recoveryAction='" + recoveryAction + '\'' +
                '}';
    }
}
