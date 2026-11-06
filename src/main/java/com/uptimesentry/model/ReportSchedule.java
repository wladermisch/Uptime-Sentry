package com.uptimesentry.model;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;

/**
 * An availability report emailed on a schedule. Each send covers the period that just ended:
 * yesterday (DAILY), the last 7 days up to yesterday (WEEKLY) or last calendar month (MONTHLY).
 */
public class ReportSchedule {

    public String id;
    public String name = "Weekly uptime report";
    public boolean enabled = true;
    /** DAILY, WEEKLY or MONTHLY. */
    public String frequency = "WEEKLY";
    /** WEEKLY: ISO day, 1 = Monday. */
    public int dayOfWeek = 1;
    /** MONTHLY: 1 to 28. */
    public int dayOfMonth = 1;
    /** "HH:mm" local time. */
    public String time = "08:00";
    /** ALL, PROFILE or TARGETS. */
    public String scope = "ALL";
    public String profileId;
    public List<Integer> targetIds = new ArrayList<>();
    public List<String> recipients = new ArrayList<>();
    /** SLA target in percent, or null for none. */
    public Double sla = 99.9;
    public boolean includeOutages = true;
    /** "yyyy-MM-dd HH:mm" of the last successful send. */
    public String lastSent;
    public String lastError;

    public boolean covers(MonitoredTarget t) {
        return switch (scope == null ? "ALL" : scope) {
            case "PROFILE" -> profileId != null && profileId.equals(t.getProfileId());
            case "TARGETS" -> targetIds != null && targetIds.contains(t.getId());
            default -> true;
        };
    }

    public LocalTime sendTime() {
        try {
            return LocalTime.parse(time == null ? "08:00" : time.trim());
        } catch (DateTimeParseException e) {
            return LocalTime.of(8, 0);
        }
    }

    /** The most recent moment at or before {@code now} this schedule was due. */
    public LocalDateTime lastDue(LocalDateTime now) {
        LocalTime at = sendTime();
        LocalDate d = now.toLocalDate();
        switch (frequency == null ? "WEEKLY" : frequency) {
            case "DAILY" -> {
                LocalDateTime today = d.atTime(at);
                return today.isAfter(now) ? today.minusDays(1) : today;
            }
            case "MONTHLY" -> {
                int dom = Math.max(1, Math.min(28, dayOfMonth));
                LocalDateTime thisMonth = d.withDayOfMonth(dom).atTime(at);
                return thisMonth.isAfter(now) ? thisMonth.minusMonths(1) : thisMonth;
            }
            default -> {
                DayOfWeek dow = DayOfWeek.of(Math.max(1, Math.min(7, dayOfWeek)));
                LocalDateTime candidate = d.with(TemporalAdjusters.previousOrSame(dow)).atTime(at);
                return candidate.isAfter(now) ? candidate.minusWeeks(1) : candidate;
            }
        }
    }

    /** The next send after {@code now}. */
    public LocalDateTime nextDue(LocalDateTime now) {
        LocalDateTime last = lastDue(now);
        return switch (frequency == null ? "WEEKLY" : frequency) {
            case "DAILY" -> last.plusDays(1);
            case "MONTHLY" -> last.plusMonths(1);
            default -> last.plusWeeks(1);
        };
    }

    /** [from, to) of the period reported on when sending at {@code sendAt}. */
    public LocalDateTime[] periodFor(LocalDateTime sendAt) {
        LocalDate day = sendAt.toLocalDate();
        return switch (frequency == null ? "WEEKLY" : frequency) {
            case "DAILY" -> new LocalDateTime[] { day.minusDays(1).atStartOfDay(), day.atStartOfDay() };
            case "MONTHLY" -> {
                LocalDate firstThis = day.withDayOfMonth(1);
                yield new LocalDateTime[] { firstThis.minusMonths(1).atStartOfDay(), firstThis.atStartOfDay() };
            }
            default -> new LocalDateTime[] { day.minusDays(7).atStartOfDay(), day.atStartOfDay() };
        };
    }
}
