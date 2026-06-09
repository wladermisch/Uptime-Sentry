package com.uptimesentry.monitor;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.persistence.TargetRepository;

/**
 * Unit tests for monitor classes.
 *   - Tests {@link PingMonitor} for a simple ping validation case.
 */

class MonitorTest {
    
    /**
     * A target that will be used for testing will be created.
	 * The target will be saved to a file so that it can be loaded by the test.
	 * It should be reachable (from within eduroam too (usually blocks ICMP packets) and therefore should be reported as online.
     */

    private static List<MonitoredTarget> targets = new ArrayList<>();
    private static final java.nio.file.Path filePath = java.nio.file.Paths.get("targets.json");

    @BeforeAll
    static void setUpBeforeClass() throws Exception {
		//Adding TestTarget to targetlist and saving it to file for testing
        targets.add(new MonitoredTarget(10, "Test Target", "PING", "141.56.16.35", 10, null));
        
        try {
            TargetRepository.saveTargets(targets, filePath);
        } catch (Exception e) {
            System.out.println("Error saving target. Please try again.");
            return;
        }
        
        System.out.println("Target added successfully for testing.");
    }

    @AfterAll
    static void tearDownAfterClass() throws Exception {
        boolean deleted = java.nio.file.Files.deleteIfExists(filePath);
    
    if (deleted) {
        System.out.println("Testfile targets.json deleted.");
    } else {
        System.out.println("Testfile could not be deleted or does not exist.");
    }
    }

    @BeforeEach
    void setUp() throws Exception {
    }

    @AfterEach
    void tearDown() throws Exception {
    }

    @Test
    void test() {
        assertNotNull(targets, "Targets list should not be null");
        assertEquals(1, targets.size(), "Expected 1 target");
        MonitoredTarget target = targets.get(0);
		PingMonitor monitor = new PingMonitor(target);
    	boolean online = monitor.checkAvailability();
    	assertTrue(online, "Target should be available. Are you sure you have an active internet connection? Is your network blocking ICMP packets?");
    }
}