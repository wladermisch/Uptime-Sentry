package com.uptimesentry.app;

import java.util.List;
import java.util.Scanner;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.monitor.HttpMonitor;
import com.uptimesentry.monitor.Monitorable;
import com.uptimesentry.monitor.PingMonitor;
import com.uptimesentry.persistence.TargetRepository;
import com.uptimesentry.service.AutoCheckService;
import com.uptimesentry.service.NotificationService;
import static com.uptimesentry.util.InputValidator.validateHost; //static import so we can call validateHost() directly without class name prefix
import static com.uptimesentry.util.InputValidator.validateName;
import static com.uptimesentry.util.InputValidator.validateTimeout;
import static com.uptimesentry.util.InputValidator.validateUrl;
import com.uptimesentry.util.Sort;
import com.uptimesentry.util.SentryLogger;
import com.uptimesentry.persistence.HistoryRepository;
import com.uptimesentry.model.CheckResult;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;


/**
 * ConsoleMenu provides the interactive command-line interface for the application.
 * It displays a menu, handles user input, and routes commands to appropriate handlers.
 */
public class ConsoleMenu {
    
    final private Scanner scanner;
    private List<MonitoredTarget> targets;
    
    final private java.nio.file.Path filePath = java.nio.file.Paths.get(TARGETS_FILE);
    private AutoCheckService autoCheckService;
    private final NotificationService notificationService;

    private static final int AUTOCHECK_INTERVAL_SECONDS = 5;
    private static final String TARGETS_FILE = "targets.json";
    
    //Constructor initializes scanner and notification service.
    public ConsoleMenu() {
        this.scanner = new Scanner(System.in);
        this.notificationService = new NotificationService();
    }
    
    //Main loop of the console menu
    public void loop() {
        try {
            targets = TargetRepository.loadTargets(filePath); //If file does not exist.
            SentryLogger.info("Loaded " + targets.size() + " targets from configuration.");
        } catch (Exception e) {
            System.out.println("First Time Setup: No existing configuration found, starting with an empty target list.");
            SentryLogger.warn("No existing configuration found. Initializing empty list.");
            targets = new java.util.ArrayList<>();
        }

        // Print startup summary
        int pingCount = 0;
        int httpCount = 0;
        for (MonitoredTarget t : targets) {
            if ("HTTP".equalsIgnoreCase(t.getType())) {
                httpCount++;
            } else if ("PING".equalsIgnoreCase(t.getType())) {
                pingCount++;
            }
        }
        System.out.println("----------------------------------------");
        System.out.println("Active monitoring tasks loaded:");
        System.out.println("- PING targets: " + pingCount);
        System.out.println("- HTTP targets: " + httpCount);
        System.out.println("----------------------------------------");

        autoCheckService = new AutoCheckService(targets, AUTOCHECK_INTERVAL_SECONDS, notificationService);

        boolean running = true;
        while (running) {
            displayMenu();
            String choice = scanner.nextLine().trim();
            switch (choice) {
                case "1":
                    handleAddTarget();
                    break;
                case "2":
                    handleListTargets();
                    break;
                case "3":
                    handleRunChecks();
                    break;
                case "4":
                    handleAutoChecks();
                    break;
                case "5":
                    handleViewHistory();
                    break;
                case "6":
                    handleRemoveTarget();
                    break;
                case "7":
                    handleEditTarget();
                    break;
                case "0":
                    running = false;
                    break;
                default:
                    System.out.println("Invalid option. Please try again.");
            }
        }
        
        if (autoCheckService != null) {
            autoCheckService.stopAutoChecks();
        }
    }
    
    //Displays the main menu options to the user.
    private void displayMenu() {
        System.out.println("\nPlease select an option:");
        System.out.println("1. Add new target to monitor");
        System.out.println("2. List all monitored targets");
        System.out.println("3. Run a check on all targets");
        System.out.println("4. Auto checks");
        System.out.println("5. View monitoring history");
        System.out.println("6. Remove a target");
        System.out.println("7. Edit a target");
        System.out.println("0. Exit application");
    }
    
    //Handles adding a new target, including input validation and saving to file.
    private void handleAddTarget() {
        System.out.println("Adding a new target...");
        System.out.print("Enter target name: ");
        String name; // declaration without unnecessary initialization
        try {
            name = validateName(scanner.nextLine().trim());
        } catch (Exception e) {
            System.out.println("Invalid target name. Please try again.");
            return;
        }
        System.out.print("Host/IP (1) or URL (2)? ");
        String choice = scanner.nextLine().trim();
        String hostOrUrl; //one variable to save either host or URL, depending on the type of target
        String targetType;
        List<Integer> acceptableStatusCodes = null; // Only relevant for HTTP targets
        switch (choice) {
            case "1":
                targetType = "PING";
                System.out.print("Enter host/IP: ");
                try {
                    hostOrUrl = validateHost(scanner.nextLine().trim());
                } catch (Exception e) {
                    System.out.println("Invalid host/IP. Please try again.");
                    return;
                }   break;
            case "2":
                targetType = "HTTP";
                System.out.print("Enter URL: ");
                try {
                    hostOrUrl = validateUrl(scanner.nextLine().trim());
                } catch (Exception e) {
                    System.out.println("Invalid URL. Please try again.");
                    return;
                }
                //Allowed statuscodes for HTTP targets:
                System.out.print("Enter acceptable HTTP status codes (comma-separated, e.g., 200, 201) or leave blank for default 200: ");
                String codesInput = scanner.nextLine().trim();
                if (!codesInput.isEmpty()) {
                    acceptableStatusCodes = new java.util.ArrayList<>();
                    String[] tokens = codesInput.split(",");
                    for (String token : tokens) {
                        try {
                            int code = Integer.parseInt(token.trim());
                            acceptableStatusCodes.add(code);
                        } catch (NumberFormatException e) {
                            System.out.println("Warning: '" + token.trim() + "' is not a valid status code and was skipped.");
                        }
                    }
                }
                
                break;
            default:
                System.out.println("Invalid option. Please try again.");
                return;
        }

        int timeout;
        System.out.print("Enter timeout (seconds): ");
        try {
            int timeoutValue = Integer.parseInt(scanner.nextLine().trim());
            timeout = validateTimeout(timeoutValue);
        } catch (Exception e) {
            System.out.println("Invalid timeout value. Please try again.");
            return;
        }
        System.out.print("Enter recovery action (or leave blank for none): ");
        String recoveryAction = scanner.nextLine().trim();

        int consecutiveFailuresLimit = 1;
        System.out.print("Enter consecutive failures before alerting (default 1): ");
        String thresholdInput = scanner.nextLine().trim();
        if (!thresholdInput.isEmpty()) {
            try {
                int threshold = Integer.parseInt(thresholdInput);
                if (threshold > 0) {
                    consecutiveFailuresLimit = threshold;
                } else {
                    System.out.println("Warning: threshold must be > 0. Using default 1.");
                }
            } catch (NumberFormatException e) {
                System.out.println("Warning: Invalid number. Using default 1.");
            }
        }

        int nextId = 1;
        for (MonitoredTarget target : targets) {
            if (target.getId() == nextId) {
                nextId++;
            }
        }
        targets.add(new MonitoredTarget(nextId, name, targetType, hostOrUrl, timeout, recoveryAction, acceptableStatusCodes, consecutiveFailuresLimit));
        try {
            TargetRepository.saveTargets(targets, filePath);
            SentryLogger.info("Target added: " + name + " (ID: " + nextId + ", Limit: " + consecutiveFailuresLimit + ")", true);
        } catch (Exception e) {
            System.out.println("Error saving target. Please try again.");
            return;
        }
        
        System.out.println("Press Enter to continue...");
        scanner.nextLine();
    }
    
    //Handles listing all monitored targets in a formatted table.
    private void handleListTargets() {
        System.out.printf("%-5s %-20s %-30s %-10s %-20s%n", "ID", "Name", "Host", "Timeout", "Recovery");
        System.out.println("-------------------------------------------------------------------------------");

        if (targets.isEmpty()) {
            System.out.println("No targets configured.");
        } else {
            for (MonitoredTarget target : targets) {
                System.out.printf("%-5d %-20s %-30s %-10d %-20s%n",
                    target.getId(),
                    target.getName(),
                    target.getHost(),
                    target.getTimeout(),
                    target.getRecoveryAction() == null || target.getRecoveryAction().isEmpty() ? "None" : target.getRecoveryAction());
            }
        }
        
    }

    /**
     * Handles running a check on all targets.
     * Adds an optional sorting step so the user can view the results ordered by
     * name, type, or current online status.
     */
    private void handleRunChecks() {
        System.out.println("Running checks on all targets...");
        if (targets.isEmpty()) {
            System.out.println("No targets to check.");
            return;
        }

        // Ask the user which sorting option they want.
        System.out.println("Sort results? (0=none, 1=Name, 2=Type, 3=Status)");
        System.out.print("Choose an option: ");
        String sortChoice = scanner.nextLine().trim();

        SentryLogger.info("Executing manual checks on " + targets.size() + " targets.");

        // Sorting happens in the Sort class, which returns a new sorted list based on the user's choice.
        java.util.List<MonitoredTarget> sorted = Sort.sort(targets, sortChoice);
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        for (MonitoredTarget target : sorted) {
            Monitorable monitor;
            if (target.getType().equalsIgnoreCase("HTTP")) {
                monitor = new HttpMonitor(target);
            } else if (target.getType().equalsIgnoreCase("PING")) {
                monitor = new PingMonitor(target);
            } else {
                System.out.println("Unknown target type for target ID " + target.getId() + ": " + target.getType());
                continue;
            }
            boolean isAvailable = monitor.checkAvailability();
            long responseTime = monitor.getResponseTime();
            System.out.printf("Target ID %d (%s): %s, Response Time: %d ms%n",
                target.getId(),
                target.getName(),
                isAvailable ? "ONLINE" : "OFFLINE",
                responseTime);
            
            // Record manual check to history
            CheckResult result = new CheckResult(
                target.getId(),
                target.getName(),
                timestamp,
                isAvailable,
                responseTime,
                isAvailable ? "Manual check succeeded." : "Manual check failed."
            );
            HistoryRepository.addResult(result);
        }
        System.out.println("Press Enter to continue...");
        scanner.nextLine();
    }
    //Handles starting/stopping auto-checks and setting the check interval.
    private void handleAutoChecks() {
        if (targets.isEmpty()) {
            System.out.println("No targets configured. Please add targets first.");
            return;
        }

        System.out.println("\n--- Auto Checks Menu ---");
        System.out.println("1. Start auto-checks");
        System.out.println("2. Stop auto-checks");
        System.out.println("3. Set check interval (seconds)");
        System.out.println("0. Back to main menu");
        System.out.print("Choose an option: ");
        
        String choice = scanner.nextLine().trim();
        switch (choice) {
            case "1":
                autoCheckService.startAutoChecks();
                System.out.println("Auto-checks started. Monitoring in background...");
                System.out.println("Press Enter to continue...");
                scanner.nextLine();
                break;
            case "2":
                autoCheckService.stopAutoChecks();
                System.out.println("Auto-checks stopped.");
                System.out.println("Press Enter to continue...");
                scanner.nextLine();
                break;
            case "3":
                System.out.print("Enter interval in seconds (minimum 1): ");
                try {
                    int interval = Integer.parseInt(scanner.nextLine().trim());
                    autoCheckService.setIntervalSeconds(interval);
                    System.out.println("Interval set to " + interval + " seconds.");
                } catch (NumberFormatException e) {
                    System.out.println("Invalid interval. Please enter a numeric value.");
                }
                System.out.println("Press Enter to continue...");
                scanner.nextLine();
                break;
            case "0":
                break;
            default:
                System.out.println("Invalid option.");
        }
    }
    /**
     * Handles viewing monitoring history (placeholder for future implementation).
     * 
     * For future implementation: this will display a history of checks for each target, including timestamps, status, and response times.
     * Need to save this to a file.
     */
    private void handleViewHistory() {
        System.out.println("\n--- Monitoring History ---");
        List<CheckResult> history = HistoryRepository.loadHistory();
        if (history.isEmpty()) {
            System.out.println("No history recorded yet.");
        } else {
            System.out.printf("%-20s %-5s %-15s %-8s %-10s %-30s%n", "Timestamp", "ID", "Name", "Status", "Latency", "Message");
            System.out.println("------------------------------------------------------------------------------------------------");
            int count = 0;
            for (CheckResult res : history) {
                System.out.printf("%-20s %-5d %-15s %-8s %-10s %-30s%n",
                    res.getTimestamp(),
                    res.getTargetId(),
                    res.getTargetName(),
                    res.isSuccess() ? "ONLINE" : "OFFLINE",
                    res.getDurationMillis() + " ms",
                    res.getMessage());
                count++;
                if (count >= 20) {
                    System.out.println("... (showing last 20 entries) ...");
                    break;
                }
            }
        }
        System.out.println("\nOptions: (1) Clear History, (0) Back");
        System.out.print("Choose option: ");
        String choice = scanner.nextLine().trim();
        if ("1".equals(choice)) {
            HistoryRepository.clearHistory();
            System.out.println("History cleared.");
            SentryLogger.info("Monitoring history cleared.", true);
        }
    }

    //Handles removing a target by ID, including input validation and saving changes to file.
    private void handleRemoveTarget() {
        System.out.println("Enter the ID of the target to remove: ");
        int idToRemove;
        try {
            idToRemove = Integer.parseInt(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            System.out.println("Invalid ID. Please enter a numeric value.");
            return;
        }
        boolean removed = targets.removeIf(target -> target.getId() == idToRemove);
        if (!removed) {
            System.out.println("Target with ID " + idToRemove + " not found.");
            return;
        }
        try {
            TargetRepository.saveTargets(targets, filePath); // Save changes to file after removal
            SentryLogger.info("Target removed: ID " + idToRemove, true);
        } catch (Exception e) {
            System.out.println("Error saving changes. Please try again.");
            return;
        }
        System.out.println("Press Enter to continue...");
        scanner.nextLine();
    }

    // Handles editing an existing monitored target.
    private void handleEditTarget() {
        System.out.println("Editing a target...");
        System.out.print("Enter target ID to edit: ");
        int idToEdit;
        try {
            idToEdit = Integer.parseInt(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            System.out.println("Invalid ID. Please enter a numeric value.");
            return;
        }

        MonitoredTarget target = null;
        for (MonitoredTarget t : targets) {
            if (t.getId() == idToEdit) {
                target = t;
                break;
            }
        }

        if (target == null) {
            System.out.println("Target with ID " + idToEdit + " not found.");
            return;
        }

        System.out.println("Editing target: " + target.getName() + " (" + target.getHost() + ")");
        System.out.println("Press Enter to keep current values.");

        System.out.print("Enter new name [" + target.getName() + "]: ");
        String newNameInput = scanner.nextLine().trim();
        if (!newNameInput.isEmpty()) {
            try {
                target.setName(validateName(newNameInput));
            } catch (Exception e) {
                System.out.println("Invalid target name. Keeping original.");
            }
        }

        System.out.print("Enter new host/IP or URL [" + target.getHost() + "]: ");
        String newHostInput = scanner.nextLine().trim();
        if (!newHostInput.isEmpty()) {
            try {
                if (target.getType().equalsIgnoreCase("PING")) {
                    target.setHost(validateHost(newHostInput));
                } else {
                    target.setHost(validateUrl(newHostInput));
                }
            } catch (Exception e) {
                System.out.println("Invalid host/URL. Keeping original.");
            }
        }

        System.out.print("Enter new timeout (seconds) [" + target.getTimeout() + "]: ");
        String newTimeoutInput = scanner.nextLine().trim();
        if (!newTimeoutInput.isEmpty()) {
            try {
                int timeoutValue = Integer.parseInt(newTimeoutInput);
                target.setTimeout(validateTimeout(timeoutValue));
            } catch (Exception e) {
                System.out.println("Invalid timeout value. Keeping original.");
            }
        }

        System.out.print("Enter new recovery action [" + (target.getRecoveryAction() == null || target.getRecoveryAction().isEmpty() ? "None" : target.getRecoveryAction()) + "]: ");
        String newRecoveryInput = scanner.nextLine().trim();
        if (!newRecoveryInput.isEmpty()) {
            target.setRecoveryAction(newRecoveryInput);
        }

        if (target.getType().equalsIgnoreCase("HTTP")) {
            System.out.print("Enter acceptable HTTP status codes [" + (target.getAcceptableStatusCodes() == null ? "200" : target.getAcceptableStatusCodes().toString()) + "]: ");
            String codesInput = scanner.nextLine().trim();
            if (!codesInput.isEmpty()) {
                List<Integer> acceptableStatusCodes = new java.util.ArrayList<>();
                String[] tokens = codesInput.split(",");
                for (String token : tokens) {
                    try {
                        int code = Integer.parseInt(token.trim());
                        acceptableStatusCodes.add(code);
                    } catch (NumberFormatException e) {
                        System.out.println("Warning: '" + token.trim() + "' is not a valid status code and was skipped.");
                    }
                }
                if (!acceptableStatusCodes.isEmpty()) {
                    target.setAcceptableStatusCodes(acceptableStatusCodes);
                }
            }
        }

        System.out.print("Enter consecutive failures before alerting [" + target.getConsecutiveFailuresLimit() + "]: ");
        String thresholdInput = scanner.nextLine().trim();
        if (!thresholdInput.isEmpty()) {
            try {
                int threshold = Integer.parseInt(thresholdInput);
                if (threshold > 0) {
                    target.setConsecutiveFailuresLimit(threshold);
                } else {
                    System.out.println("Threshold must be greater than zero. Keeping original.");
                }
            } catch (NumberFormatException e) {
                System.out.println("Invalid threshold. Keeping original.");
            }
        }

        try {
            TargetRepository.saveTargets(targets, filePath);
            SentryLogger.info("Target edited: ID " + target.getId() + " - " + target.getName(), true);
        } catch (Exception e) {
            System.out.println("Error saving changes. Please try again.");
        }
        System.out.println("Press Enter to continue...");
        scanner.nextLine();
    }
    
    //End loop and close scanner.
    public void close() {
        if (scanner != null) {
            scanner.close();
        }
    }
}
