package com.uptimesentry.util;

import com.uptimesentry.exception.ValidationException;

/**
 * InputValidator provides centralized validation methods for user input.
 * Throws ValidationException for invalid input, enabling DAU-sicher (fool-proof) behavior.
 */
public class InputValidator {
    
    /**
     * Validates that a string is a valid URL.
     * 
     * @param urlString the URL string to validate
     * @return the validated URL string if valid
     * @throws ValidationException if the URL is invalid
     */
    public static String validateUrl(String urlString) throws ValidationException {
        if (urlString == null || urlString.trim().isEmpty()) {
            throw new ValidationException("URL cannot be empty.");
        }
        if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
            throw new ValidationException("URL must start with http:// or https://");
        }
        try {
            new java.net.URL(urlString);
        } catch (java.net.MalformedURLException e) {
            throw new ValidationException("URL is malformed.");
        }
        return urlString;
    }
    
    /**
     * Validates that a timeout value is within acceptable range.
     * 
     * @param timeout the timeout in seconds
     * @return the validated timeout if valid
     * @throws ValidationException if timeout is invalid (negative, zero, or too large)
     */
    public static int validateTimeout(int timeout) throws ValidationException {
        if (timeout <= 0) {
            throw new ValidationException("Timeout must be greater than zero.");
        }
        if (timeout > 3600) {
            throw new ValidationException("Timeout must be less than or equal to 3600 seconds (1 hour).");
        }

        return timeout;
    }
    
    /**
     * Validates that a name is not empty or whitespace-only.
     * 
     * @param name the name to validate
     * @return the trimmed name if valid
     * @throws ValidationException if name is empty or null
     */
    public static String validateName(String name) throws ValidationException {
        if (name == null || name.trim().isEmpty()) {
            throw new ValidationException("Name cannot be empty.");
        }
        return name;
    }
    /**
     * Validates that the host is not empty or whitespace-only.
     * 
     * @param host the host to validate
     * @return the trimmed host if valid
     * @throws ValidationException if host is empty or null
     */
    public static String validateHost(String host) throws ValidationException {
        if (host == null || host.trim().isEmpty()) {
            throw new ValidationException("Host cannot be empty.");
        }
        return host;}
}
