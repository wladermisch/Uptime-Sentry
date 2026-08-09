package com.uptimesentry.util;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class SentryLogger {
    private static final Path LOG_FILE = Paths.get("sentry.log");
    private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static synchronized void log(String level, String message, boolean printToConsole) {
        String logEntry = String.format("[%s] [%s] %s%n", LocalDateTime.now().format(formatter), level, message);
        if (printToConsole) {
            System.out.print(logEntry);
        }
        try {
            Files.writeString(LOG_FILE, logEntry, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            System.err.println("Failed to write to log file: " + e.getMessage());
        }
    }

    public static void info(String message) {
        log("INFO", message, false);
    }

    public static void info(String message, boolean printToConsole) {
        log("INFO", message, printToConsole);
    }

    public static void warn(String message) {
        log("WARN", message, false);
    }

    public static void warn(String message, boolean printToConsole) {
        log("WARN", message, printToConsole);
    }

    public static void error(String message) {
        log("ERROR", message, false);
    }

    public static void error(String message, boolean printToConsole) {
        log("ERROR", message, printToConsole);
    }
}
