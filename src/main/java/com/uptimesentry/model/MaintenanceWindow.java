package com.uptimesentry.model;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Planned work on some targets. During a window checks still run and are recorded, but they are
 * marked as maintenance: no alerts go out, and reports leave that time out of availability.
 *
 * A window is either one period (ONCE: start to end, "yyyy-MM-ddTHH:mm") or repeats every week
 * (WEEKLY: on the given days from startTime to endTime, "HH:mm"; an end before the start runs past midnight).
 */
public class MaintenanceWindow {

    public String id;
    public String title = "";
    public String note = "";
    public boolean enabled = true;
    /** ALL, PROFILE or TARGETS. */
    public String scope = "ALL";
    public String profileId;
    public List<Integer> targetIds = new ArrayList<>();
    /** ONCE or WEEKLY. */
    public String mode = "ONCE";
    public String start;
    public String end;
    /** ISO days of the week, 1 = Monday to 7 = Sunday. */
    public List<Integer> days = new ArrayList<>();
    public String startTime = "22:00";
    public String endTime = "23:00";

    public boolean covers(MonitoredTarget t) {
        if (t == null) return false;
        return switch (scope == null ? "ALL" : scope) {
            case "PROFILE" -> profileId != null && profileId.equals(t.getProfileId());
            case "TARGETS" -> targetIds != null && targetIds.contains(t.getId());
            default -> true;
        };
    }

    public boolean isActive(LocalDateTime now) {
        if (!enabled) return false;
        if ("WEEKLY".equalsIgnoreCase(mode)) {
            LocalTime from = time(startTime);
            LocalTime to = time(endTime);
            if (from == null || to == null || days == null || days.isEmpty()) return false;
            LocalTime t = now.toLocalTime();
            int today = now.getDayOfWeek().getValue();
            if (!to.isAfter(from)) {
                // Runs past midnight: today's evening part, or the morning after yesterday's start.
                int yesterday = now.minusDays(1).getDayOfWeek().getValue();
                return (days.contains(today) && !t.isBefore(from)) || (days.contains(yesterday) && t.isBefore(to));
            }
            return days.contains(today) && !t.isBefore(from) && t.isBefore(to);
        }
        LocalDateTime s = dateTime(start);
        LocalDateTime e = dateTime(end);
        return s != null && e != null && !now.isBefore(s) && now.isBefore(e);
    }

    /** The next time this window starts after {@code now}, or null (ended, disabled or invalid). */
    public LocalDateTime nextStart(LocalDateTime now) {
        if (!enabled) return null;
        if ("WEEKLY".equalsIgnoreCase(mode)) {
            LocalTime from = time(startTime);
            if (from == null || days == null || days.isEmpty()) return null;
            for (int i = 0; i <= 7; i++) {
                LocalDate d = now.toLocalDate().plusDays(i);
                LocalDateTime candidate = d.atTime(from);
                if (days.contains(d.getDayOfWeek().getValue()) && candidate.isAfter(now)) return candidate;
            }
            return null;
        }
        LocalDateTime s = dateTime(start);
        return s != null && s.isAfter(now) ? s : null;
    }

    static LocalTime time(String v) {
        try {
            return v == null ? null : LocalTime.parse(v.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    static LocalDateTime dateTime(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return LocalDateTime.parse(v.trim().replace(' ', 'T').substring(0, Math.min(16, v.trim().length())));
        } catch (DateTimeParseException | StringIndexOutOfBoundsException e) {
            return null;
        }
    }

    /** For log lines: "Mon, Wed 22:00–23:00" or the one-off period. */
    public String describe() {
        if ("WEEKLY".equalsIgnoreCase(mode)) {
            StringBuilder sb = new StringBuilder();
            for (Integer d : days) {
                if (d == null || d < 1 || d > 7) continue;
                if (sb.length() > 0) sb.append(", ");
                String n = DayOfWeek.of(d).name();
                sb.append(n.charAt(0)).append(n.substring(1, 3).toLowerCase());
            }
            return sb + " " + startTime + "–" + endTime;
        }
        return start + " – " + end;
    }
}
