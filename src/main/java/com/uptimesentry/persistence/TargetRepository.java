package com.uptimesentry.persistence;

import java.nio.file.Path;
import java.util.List;

import com.uptimesentry.model.MonitoredTarget;

/**
 * TargetRepository handles loading and saving monitored targets to/from JSON file.
 * This class provides the persistence layer for targets.
 */
public class TargetRepository {
    
    /**
     * Loads all monitored targets from a JSON file.
     * 
     * @param filePath the path to the JSON configuration file
     * @return a list of monitored targets
     * @throws Exception if the file cannot be read or parsed
     */
    public static List<MonitoredTarget> loadTargets(Path filePath) throws Exception {
        // TODO: implement JSON file loading using Gson
        // - read JSON file from filePath
        // - parse JSON to array of MonitoredTarget objects
        // - handle FileNotFoundException (return empty list or throw)
        // - handle JSON parsing errors with descriptive exceptions
        return null;
    }
    
    /**
     * Saves all monitored targets to a JSON file.
     * 
     * @param targets the list of targets to save
     * @param filePath the path where the JSON file should be written
     * @throws Exception if the file cannot be written
     */
    public static void saveTargets(List<MonitoredTarget> targets, Path filePath) throws Exception {
        // TODO: implement JSON file saving using Gson
        // - convert targets list to JSON
        // - write JSON to filePath
        // - handle IOException with descriptive exceptions
        // - optionally pretty-print JSON for readability
    }
}
