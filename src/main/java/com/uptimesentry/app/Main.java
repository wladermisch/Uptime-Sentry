package com.uptimesentry.app;

/**
 * Main is the application entry point.
 * It initializes the application and starts the console menu loop.
 */
public class Main {
    
    /**
     * Main method - program entry point.
     * 
     * @param args command-line arguments (not used in this version)
     */
    public static void main(String[] args) {
        System.out.println("========================================");
        System.out.println("     Welcome to Uptime-Sentry");
        System.out.println("========================================");
        System.out.println();
        
        // TODO: initialize application
        // - create ConsoleMenu instance
        // - load existing targets from JSON config
        // - start the menu loop
        // - handle any startup exceptions
        // - ensure cleanup on exit
        
        ConsoleMenu menu = new ConsoleMenu();
        try {
            menu.loop();
        } finally {
            menu.close();
            System.out.println("\nGoodbye!");
        }
    }
}
