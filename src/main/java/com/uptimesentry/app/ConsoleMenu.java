package com.uptimesentry.app;

import java.util.Scanner;

/**
 * ConsoleMenu provides the interactive command-line interface for the application.
 * It displays a menu, handles user input, and routes commands to appropriate handlers.
 */
public class ConsoleMenu {
    
    private Scanner scanner;
    
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
    }
    
    /**
     * Handles listing all monitored targets.
     */
    private void handleListTargets() {
        // TODO: implement target listing
        // - display all targets in a readable format
        // - show: ID, name, host, timeout, recovery action
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
