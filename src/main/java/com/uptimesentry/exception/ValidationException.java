package com.uptimesentry.exception;

/**
 * Own exception class for validation-related errors.
 * Thrown when a validation error occurs (e.g., invalid URL, invalid timeout).
 * This exception enables the application to handle user input errors gracefully (DAU-sicher).
 */
public class ValidationException extends Exception {
    
    public ValidationException(String message) {
        super(message);
    }
    
    public ValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}
