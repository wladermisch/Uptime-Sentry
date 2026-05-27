package com.uptimesentry.persistence;

import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
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
        if (filePath == null) {
            return new ArrayList<>();
        }

        if (!Files.exists(filePath)) {
            return new ArrayList<>();
        }

        String json = Files.readString(filePath);

        Gson gson = new Gson();
        Type listType = new TypeToken<List<MonitoredTarget>>() {}.getType();
        List<MonitoredTarget> list = gson.fromJson(json, listType);
        return list != null ? list : new ArrayList<>();
    }
    
    /**
     * Saves all monitored targets to a JSON file.
     * 
     * @param targets the list of targets to save
     * @param filePath the path where the JSON file should be written
     * @throws Exception if the file cannot be written
     */
    public static void saveTargets(List<MonitoredTarget> targets, Path filePath) throws Exception {
        if (filePath == null) {
            throw new IllegalArgumentException("filePath must not be null");
        }

        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        String json = gson.toJson(targets != null ? targets : new ArrayList<>());

        if (filePath.getParent() != null) {
            Files.createDirectories(filePath.getParent());
        }

        Files.writeString(filePath, json, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }
}
