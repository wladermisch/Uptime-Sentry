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
import static com.uptimesentry.util.InputValidator.validateHost;
import static com.uptimesentry.util.InputValidator.validateName;
import static com.uptimesentry.util.InputValidator.validateTimeout;
import static com.uptimesentry.util.InputValidator.validateUrl;
import com.uptimesentry.util.Sort;


/**
 * ConsoleMenu provides the interactive command-line interface for the application.
 * It displays a menu, handles user input, and routes commands to appropriate handlers.
 */
public class ConsoleMenu {
    
    final private Scanner scanner;
    private List<MonitoredTarget> targets;
    final private java.nio.file.Path filePath = java.nio.file.Paths.get("targets.json");
    private AutoCheckService autoCheckService;
    private final NotificationService notificationService;
    
    /**
     * Constructor for initializing the console menu.
     */
    public ConsoleMenu() {
        this.scanner = new Scanner(System.in);
        this.notificationService = new NotificationService();
    }
    
    /**
     * Starts the main menu loop. Continues until the user chooses to exit.
     */
    public void loop() {
        try {
            targets =TargetRepository.loadTargets(filePath);
        } catch (Exception e) {
            System.out.println("First Time Setup: No existing configuration found, starting with an empty target list.");
            targets = new java.util.ArrayList<>();
        }

        autoCheckService = new AutoCheckService(targets, 30, notificationService);

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
    
    /**
     * Displays the main menu options.
     */
    private void displayMenu() {

        System.out.println("Please select an option:");
        System.out.println("1. Add new target to monitor");
        System.out.println("2. List all monitored targets");
        System.out.println("3. Run a check on all targets");
        System.out.println("4. Auto checks");
        System.out.println("5. View monitoring history");
        System.out.println("6. Remove a target");
        System.out.println("0. Exit application");
    }
    
    /**
     * Handles adding a new target via user input.
     */
    private void handleAddTarget() {
        System.out.println("Adding a new target...");
        System.out.print("Enter target name: ");
        String name = null;
        try {
            name = validateName(scanner.nextLine().trim());
        } catch (Exception e) {
            System.out.println("Invalid target name. Please try again.");
            return;
        }
        System.out.print("Host/IP (1) or URL (2)? ");
        String choice = scanner.nextLine().trim();
        String hostOrUrl;
        String targetType;
        if (choice.equals("1")) {
            targetType = "PING";
            System.out.print("Enter host/IP: ");
            try {
                hostOrUrl = validateHost(scanner.nextLine().trim());
            } catch (Exception e) {
                System.out.println("Invalid host/IP. Please try again.");
                return;
            }
        } else if (choice.equals("2")) {
            targetType = "HTTP";
            System.out.print("Enter URL: ");
            try {
                hostOrUrl = validateUrl(scanner.nextLine().trim());
            } catch (Exception e) {
                System.out.println("Invalid URL. Please try again.");
                return;
            }
        } else {
            System.out.println("Invalid option. Please try again.");
            return;
        }

        int timeout = 0;
        System.out.print("Enter timeout (seconds): ");
        try {
            int timeoutValue = Integer.parseInt(scanner.nextLine().trim());
            timeout = validateTimeout(timeoutValue);
        } catch (Exception e) {
            System.out.println("Invalid timeout value. Please try again.");
            return;
        }
        System.out.print("Enter recovery action: ");
        System.out.print("Paste command to execute on failure (or leave blank for none)");
        String recoveryAction = scanner.nextLine().trim();
        int nextId = 1;
        for (MonitoredTarget target : targets) {
            if (target.getId() == nextId) {
                nextId++;
            }
        }
        targets.add(new MonitoredTarget(nextId, name, targetType, hostOrUrl, timeout, recoveryAction));
        try {
            TargetRepository.saveTargets(targets, filePath);
        } catch (Exception e) {
            System.out.println("Error saving target. Please try again.");
            return;
        }
        
        System.out.println("Target added successfully. ID: " + nextId);
        System.out.println("Press Enter to continue...");
        scanner.nextLine();

    }
    
    /**
     * Handles listing all monitored targets.
     */
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

        // Delegate the sorting to the utility class. It returns a new list.
        java.util.List<MonitoredTarget> sorted = Sort.sort(targets, sortChoice);
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
            System.out.println("Press Enter to continue...");
            scanner.nextLine();
        }
    }
    /**
     * Handles the auto-checks menu, allowing users to start/stop auto-checks and set intervals.
     */
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
        System.out.println("Coming soon: monitoring history feature is under development.");
    }
    /**
     * Handles removing a target by ID.
     */
    private void handleRemoveTarget() {
        System.out.println("Enter the ID of the target to remove: ");
        int idToRemove;
        try {
            idToRemove = Integer.parseInt(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            System.out.println("Invalid ID. Please enter a numeric value.");
            return;
        }
        try {
            targets.removeIf(target -> target.getId() == idToRemove); // Will throw if ID not found, which we catch below
        } catch (Exception e) {
            System.out.println("Error removing target, is the ID correct? Please try again.");
            return;
        }
        try {
            TargetRepository.saveTargets(targets, filePath); // Save changes to file after removal
        } catch (Exception e) {
            System.out.println("Error saving changes. Please try again.");
            return;
        }
        System.out.println("Target removed successfully.");
        System.out.println("Press Enter to continue...");
        scanner.nextLine();
    }
    
    /**
     * Closes the menu (cleanup).
     */
    public void close() {
        if (scanner != null) {
            scanner.close();
        }
    }
}
