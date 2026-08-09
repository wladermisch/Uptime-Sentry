package com.uptimesentry.persistence;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import com.uptimesentry.model.CheckResult;

public class HistoryRepository {
    private static final Path HISTORY_FILE = Paths.get("history.json");
    private static final int MAX_HISTORY_ENTRIES = 200;

    public static synchronized List<CheckResult> loadHistory() {
        if (!Files.exists(HISTORY_FILE)) {
            return new ArrayList<>();
        }
        try {
            String json = Files.readString(HISTORY_FILE);
            Gson gson = new Gson();
            Type listType = new TypeToken<List<CheckResult>>() {}.getType();
            List<CheckResult> list = gson.fromJson(json, listType);
            return list != null ? list : new ArrayList<>();
        } catch (IOException e) {
            return new ArrayList<>();
        }
    }

    public static synchronized void addResult(CheckResult result) {
        List<CheckResult> history = loadHistory();
        history.add(0, result); // Add newest first
        if (history.size() > MAX_HISTORY_ENTRIES) {
            history = history.subList(0, MAX_HISTORY_ENTRIES);
        }
        saveHistory(history);
    }

    public static synchronized void saveHistory(List<CheckResult> history) {
        try {
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            String json = gson.toJson(history);
            Files.writeString(HISTORY_FILE, json, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            System.err.println("Failed to save history: " + e.getMessage());
        }
    }

    public static synchronized void clearHistory() {
        try {
            Files.deleteIfExists(HISTORY_FILE);
        } catch (IOException e) {
            System.err.println("Failed to clear history: " + e.getMessage());
        }
    }
}
