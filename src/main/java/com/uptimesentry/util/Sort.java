package com.uptimesentry.util;

// Externe Java-Utilities importieren
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.monitor.HttpMonitor;
import com.uptimesentry.monitor.Monitorable;
import com.uptimesentry.monitor.PingMonitor;

/**
 * Sorts a list of {@link MonitoredTarget} based on the
 * user’s choice (0 = none, 1 = name, 2 = type, 3 = online status).
 */
public class Sort {

    /**
     * Sorts a list of MonitoredTarget based on the user's choice.
     *
     * @param targets    original target list (may be immutable)
     * @param sortChoice user choice as a string
     * @return a new list sorted accordingly
     */
    public static List<MonitoredTarget> sort(List<MonitoredTarget> targets, String sortChoice) {
        // Work on a copy to keep the original list unchanged.
        List<MonitoredTarget> sorted = new ArrayList<>(targets);

        switch (sortChoice) {
            case "1" -> Collections.sort(sorted,
                    Comparator.comparing(MonitoredTarget::getName, String.CASE_INSENSITIVE_ORDER)); // Sort by name, ignoring case
            
            case "2" -> Collections.sort(sorted,
                    Comparator.comparing(MonitoredTarget::getType, String.CASE_INSENSITIVE_ORDER)); // Sort by type, ignoring case
            
            case "3" -> {
                Map<Integer, Boolean> statusMap = new HashMap<>();
                for (MonitoredTarget t : sorted) {
                    Monitorable m = t.getType().equalsIgnoreCase("HTTP")
                            ? new HttpMonitor(t)
                            : new PingMonitor(t);
                    statusMap.put(t.getId(), m.checkAvailability());
                }
                // Online targets (true) will be sorted before offline ones (false) because we compare b to a.
                Collections.sort(sorted, (a, b) -> Boolean.compare(statusMap.get(b.getId()), statusMap.get(a.getId())));
            }
            
            default -> {
                // keep original order
            }
        }
        return sorted;
    }
}