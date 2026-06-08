package com.uptimesentry.util;
public class Sort {

	/**
	 * Sorts a list of {@link com.uptimesentry.model.MonitoredTarget} based on the
	 * user’s choice (0 = none, 1 = name, 2 = type, 3 = online status).
	 *
	 * @param targets   original target list (may be immutable)
	 * @param sortChoice user choice as a string
	 * @return a new list sorted accordingly
	 */
	public static java.util.List<com.uptimesentry.model.MonitoredTarget> sort(
			java.util.List<com.uptimesentry.model.MonitoredTarget> targets,
			String sortChoice) {
		// Work on a mutable copy to keep the original list unchanged.
		java.util.List<com.uptimesentry.model.MonitoredTarget> sorted = new java.util.ArrayList<>(targets);

		switch (sortChoice) {
			case "1" -> java.util.Collections.sort(sorted,
					java.util.Comparator.comparing(com.uptimesentry.model.MonitoredTarget::getName,
							java.lang.String.CASE_INSENSITIVE_ORDER));
			case "2" -> java.util.Collections.sort(sorted,
					java.util.Comparator.comparing(com.uptimesentry.model.MonitoredTarget::getType,
							java.lang.String.CASE_INSENSITIVE_ORDER));
			case "3" -> {
				java.util.Map<Integer, Boolean> statusMap = new java.util.HashMap<>();
				for (com.uptimesentry.model.MonitoredTarget t : sorted) {
					com.uptimesentry.monitor.Monitorable m = t.getType().equalsIgnoreCase("HTTP")
							? new com.uptimesentry.monitor.HttpMonitor(t)
							: new com.uptimesentry.monitor.PingMonitor(t);
					statusMap.put(t.getId(), m.checkAvailability());
				}
				java.util.Collections.sort(sorted,
						(a, b) -> Boolean.compare(statusMap.get(b.getId()), statusMap.get(a.getId())));
			}
			default -> {
				// keep original order
			}
		}
		return sorted;
	}

}
				// Comparator that puts ONLINE (true) before OFFLINE (false).
