package com.uptimesentry.app;

import java.util.Scanner;
import java.util.List;

import com.uptimesentry.model.MonitoredTarget;
import static com.uptimesentry.util.InputValidator.validateHost;
import static com.uptimesentry.util.InputValidator.validateName;
import static com.uptimesentry.util.InputValidator.validateTimeout;
import static com.uptimesentry.util.InputValidator.validateUrl;
import com.uptimesentry.persistence.TargetRepository;


/**
 * ConsoleMenu provides the interactive command-line interface for the application.
 * It displays a menu, handles user input, and routes commands to appropriate handlers.
 */
public class ConsoleMenu {
    
    private Scanner scanner;
    private List<MonitoredTarget> targets;
    private java.nio.file.Path filePath;
    
    /**
     * Constructor for initializing the console menu.
     */
    public ConsoleMenu() {
        this.scanner = new Scanner(System.in);
    }
    
    /**
     * Starts the main menu loop. Continues until the user chooses to exit.
     */
    public void loop() {
        // TODO: implement console menu loop
        // - display menu options: add target, list targets, run checks, view history, exit
        // - read user input
        // - route to appropriate handler methods
        // - continue until user selects exit
        try {
            targets =TargetRepository.loadTargets(filePath);
        } catch (Exception e) {
            System.out.println("First Time Setup: No existing configuration found, starting with an empty target list.");
            targets = new java.util.ArrayList<>();
        }

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
                    handleViewHistory();
                    break;
                case "5":
                    handleRemoveTarget();
                    break;
                case "0":
                    running = false;
                    break;
                default:
                    System.out.println("Invalid option. Please try again.");
            }
        }
    }
    
    /**
     * Displays the main menu options.
     */
    private void displayMenu() {
        // TODO: display readable menu options
        // - (1) Add new target to monitor
        // - (2) List all monitored targets
        // - (3) Run a check on all targets
        // - (4) View monitoring history
        // - (5) Remove a target
        // - (0) Exit application

        System.out.println("Please select an option:");
        System.out.println("1. Add new target to monitor");
        System.out.println("2. List all monitored targets");
        System.out.println("3. Run a check on all targets");
        System.out.println("4. View monitoring history");
        System.out.println("5. Remove a target");
        System.out.println("0. Exit application");
    }
    
    /**
     * Handles adding a new target via user input.
     */
    private void handleAddTarget() {
        // TODO: implement interactive target creation
        // - prompt for: name, host/URL, timeout, recovery action
        // - validate inputs using InputValidator
        // - save to targets list
        // - handle validation errors gracefully
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
        if (choice.equals("1")) {
            System.out.print("Enter host/IP: ");
            try {
                hostOrUrl = validateHost(scanner.nextLine().trim());
            } catch (Exception e) {
                System.out.println("Invalid host/IP. Please try again.");
                return;
            }
        } else if (choice.equals("2")) {
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
        targets.add(new MonitoredTarget(nextId, name, hostOrUrl, timeout, recoveryAction));
        try {
            TargetRepository.saveTargets(targets, filePath);
        } catch (Exception e) {
            System.out.println("Error saving target. Please try again.");
            return;
        }
        
        System.out.println("Target added successfully. ID: " + nextId);

        
    }
    
    /**
     * Handles listing all monitored targets.
     */
    private void handleListTargets() {
        // TODO: implement target listing
        // - display all targets in a readable format
        // - show: ID, name, host, timeout, recovery action
        System.out.println("Listing all monitored targets...");
        System.out.println("ID | Name | Host | Timeout (s) | Recovery Action");
        
    }
    
    /**
     * Handles running a check on all targets.
     */
    private void handleRunChecks() {
        // TODO: implement check execution
        // - iterate through all targets as Monitorable objects
        // - call checkAvailability() on each
        // - store results in history
        // - print results to console

        System.out.println("Running checks on all targets...");
        for (MonitoredTarget target : targets) {
            target.checkAvailability();
        }
    }

    private void handleViewHistory() {
    }

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
            targets.removeIf(target -> target.getId() == idToRemove);
        } catch (Exception e) {
            System.out.println("Error removing target, is the ID correct? Please try again.");
            return;
        }
        try {
            TargetRepository.saveTargets(targets, filePath);
        } catch (Exception e) {
            System.out.println("Error saving changes. Please try again.");
            return;
        }
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
