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
        // TODO: implement URL validation using java.net.URL
        // - check for null/empty input
        // - ensure it starts with http:// or https://
        // - attempt to parse as URL object
        // - throw ValidationException with descriptive message if invalid
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
        // TODO: implement timeout validation
        // - ensure timeout is > 0
        // - ensure timeout is <= some reasonable max (e.g., 3600 seconds)
        // - throw ValidationException with descriptive message if invalid
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
        // TODO: implement name validation
        // - check for null/empty input
        // - trim whitespace
        // - throw ValidationException if invalid
        return name;
    }
}
