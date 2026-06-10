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
            return new ArrayList<>(); //Create empty list if no file path is provided
        }

        if (!Files.exists(filePath)) {
            return new ArrayList<>(); //Create empty list if file does not exist (first run)
        }

        String json = Files.readString(filePath);

        Gson gson = new Gson();
        Type listType = new TypeToken<List<MonitoredTarget>>() {}.getType(); // TypeToken is used to get the correct generic type for deserialization, else gson does not know what type of list to create and will return wrong object instead of MonitoredTarget objects.
        List<MonitoredTarget> list = gson.fromJson(json, listType); // Deserialize(Load from file to memory) JSON to List<MonitoredTarget>
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
        String json = gson.toJson(targets != null ? targets : new ArrayList<>()); // Serialize(Save from memory to file) List<MonitoredTarget> to JSON. If targets is null, we save an empty list instead of null, to avoid issues when loading later.

        if (filePath.getParent() != null) {
            Files.createDirectories(filePath.getParent()); // Ensure parent directories exist, otherwise writing to file will fail if the directory does not exist. This is a safeguard for cases where the user might specify a path with non-existing directories.
        }

        Files.writeString(filePath, json, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }
}
