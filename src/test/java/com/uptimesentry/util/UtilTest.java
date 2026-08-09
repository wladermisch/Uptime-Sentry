package com.uptimesentry.util;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.uptimesentry.exception.ValidationException;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.persistence.TargetRepository;
import static com.uptimesentry.util.InputValidator.validateUrl;

/**
 * Unit tests for utility classes.
 * - Tests {@link InputValidator} for 2 simple URL validation cases.
 * - Tests {@link Sort#sort(java.util.List, String)} to ensure that the
 * status‑based sorting (option "3") puts an online target before an offline
 * one.
 */
public class UtilTest {

    private static final List<MonitoredTarget> targets = new ArrayList<>();
    private static final java.nio.file.Path filePath = java.nio.file.Paths.get("targets.json");

    @BeforeAll
    static void setUpBeforeClass() {
        // Target that should be online (htw-dresden.de)
        targets.add(new MonitoredTarget(1, "OnlineTarget", "PING", "141.56.16.35", 5, "", null));
        // Target that should be offline
        targets.add(new MonitoredTarget(2, "OfflineTarget", "PING", "240.0.0.1", 5, "", null));

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
        assertNotNull(targets);
        assertEquals(2, targets.size());

        List<MonitoredTarget> sorted = Sort.sort(targets, "3");
        assertEquals("OnlineTarget", sorted.get(0).getName(), "Expected the online target to be first in the sorted list.");
        assertEquals("OfflineTarget", sorted.get(1).getName(), "Expected the offline target to be second in the sorted list.");
        assertThrows(ValidationException.class, () -> validateUrl("htps://example.com"), "Expected validateUrl to throw ValidationException for an invalid URL.");
        assertDoesNotThrow(() -> validateUrl("https://example.com"), "Expected validateUrl to not throw an exception for a valid URL.");

        // Test failure threshold field
        assertEquals(1, targets.get(0).getConsecutiveFailuresLimit());
        targets.get(0).setConsecutiveFailuresLimit(3);
        assertEquals(3, targets.get(0).getConsecutiveFailuresLimit());
    }
    }