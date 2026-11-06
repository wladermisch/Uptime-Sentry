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
    private String keyword;
    private String keywordRule; // MUST_CONTAIN, MUST_NOT_CONTAIN, DISABLED
    private List<Integer> degradedStatusCodes;
    private int degradedLatencyThreshold = 1500; // in ms
    private boolean paused = false;
    /** The desktop app's profile id, for maintenance windows, webhooks and reports scoped to a profile. */
    private String profileId;
    /** TCP: the port to connect to. SSL: the port of the TLS service (443 when 0). */
    private int port;
    /** DNS: addresses the name must resolve to (any of them), comma separated; empty accepts any answer. */
    private String dnsExpected;
    /** SSL: counts as down when the certificate expires within this many days. */
    private int sslWarnDays = 14;
    /** Alert when this many checks in a row are slower than degradedLatencyThreshold; 0 turns it off. */
    private int slowAlertAfter;

    // Outage email, already resolved by the desktop app from the target, its profile and the app settings.
    // No recipients means no email. Empty templates fall back to EmailService's defaults.
    private List<String> emailRecipients;
    private String emailDownSubject;
    private String emailDownBody;
    private boolean emailOnRecovery = true;
    private String emailUpSubject;
    private String emailUpBody;

    /**
     * No-argument constructor so Jackson can deserialize targets sent by the desktop app
     * (PUT /api/targets, POST /api/targets). Fields are filled through the setters.
     */
    public MonitoredTarget() {
    }

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

    public String getKeyword() {
        return keyword;
    }

    public void setKeyword(String keyword) {
        this.keyword = keyword;
    }

    public String getKeywordRule() {
        return keywordRule == null ? "DISABLED" : keywordRule;
    }

    public void setKeywordRule(String keywordRule) {
        this.keywordRule = keywordRule;
    }

    public List<Integer> getDegradedStatusCodes() {
        return degradedStatusCodes;
    }

    public void setDegradedStatusCodes(List<Integer> degradedStatusCodes) {
        this.degradedStatusCodes = degradedStatusCodes;
    }

    public int getDegradedLatencyThreshold() {
        return degradedLatencyThreshold <= 0 ? 1500 : degradedLatencyThreshold;
    }

    public void setDegradedLatencyThreshold(int degradedLatencyThreshold) {
        this.degradedLatencyThreshold = degradedLatencyThreshold;
    }

    public boolean isPaused() {
        return paused;
    }

    public void setPaused(boolean paused) {
        this.paused = paused;
    }

    public String getProfileId() {
        return profileId;
    }

    public void setProfileId(String profileId) {
        this.profileId = profileId;
    }

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public String getDnsExpected() {
        return dnsExpected;
    }

    public void setDnsExpected(String dnsExpected) {
        this.dnsExpected = dnsExpected;
    }

    public int getSslWarnDays() {
        return Math.max(0, sslWarnDays);
    }

    public void setSslWarnDays(int sslWarnDays) {
        this.sslWarnDays = sslWarnDays;
    }

    public int getSlowAlertAfter() {
        return Math.max(0, slowAlertAfter);
    }

    public void setSlowAlertAfter(int slowAlertAfter) {
        this.slowAlertAfter = slowAlertAfter;
    }

    public List<String> getEmailRecipients() {
        return emailRecipients;
    }

    public void setEmailRecipients(List<String> emailRecipients) {
        this.emailRecipients = emailRecipients;
    }

    public String getEmailDownSubject() {
        return emailDownSubject;
    }

    public void setEmailDownSubject(String emailDownSubject) {
        this.emailDownSubject = emailDownSubject;
    }

    public String getEmailDownBody() {
        return emailDownBody;
    }

    public void setEmailDownBody(String emailDownBody) {
        this.emailDownBody = emailDownBody;
    }

    public boolean isEmailOnRecovery() {
        return emailOnRecovery;
    }

    public void setEmailOnRecovery(boolean emailOnRecovery) {
        this.emailOnRecovery = emailOnRecovery;
    }

    public String getEmailUpSubject() {
        return emailUpSubject;
    }

    public void setEmailUpSubject(String emailUpSubject) {
        this.emailUpSubject = emailUpSubject;
    }

    public String getEmailUpBody() {
        return emailUpBody;
    }

    public void setEmailUpBody(String emailUpBody) {
        this.emailUpBody = emailUpBody;
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
