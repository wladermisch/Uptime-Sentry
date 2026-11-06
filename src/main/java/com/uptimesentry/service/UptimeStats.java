package com.uptimesentry.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.uptimesentry.model.CheckResult;

/**
 * Availability figures from recorded checks, the same way the desktop app's reports count them:
 * availability is the share of successful checks, and an outage runs from the first failed check to
 * the next successful one. Checks during maintenance are left out.
 */
public final class UptimeStats {

    public static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private UptimeStats() {
    }

    public record Outage(LocalDateTime start, LocalDateTime end, long durationMs, int failedChecks, String cause, String firstCheckTs) {
    }

    public record Figures(int checks, int failed, int maintenanceChecks, Double availability, List<Outage> outages,
                          long downtimeMs, long longestMs, Double avgMs, Double p95Ms) {
    }

    public static LocalDateTime parse(String ts) {
        try {
            return LocalDateTime.parse(ts, TS);
        } catch (DateTimeParseException | NullPointerException e) {
            return null;
        }
    }

    /** Figures for one target's checks (any order) inside [from, to). */
    public static Figures compute(List<CheckResult> checks, LocalDateTime from, LocalDateTime to, LocalDateTime now) {
        List<CheckResult> sorted = new ArrayList<>(checks);
        sorted.sort(Comparator.comparing(CheckResult::getTimestamp));
        LocalDateTime periodEnd = to.isBefore(now) ? to : now;

        int total = 0;
        int failed = 0;
        int maint = 0;
        List<Long> ms = new ArrayList<>();
        for (CheckResult c : sorted) {
            LocalDateTime t = parse(c.getTimestamp());
            if (t == null || t.isBefore(from) || !t.isBefore(to)) continue;
            if (c.inMaintenance()) {
                maint++;
                continue;
            }
            total++;
            if (!c.isSuccess()) failed++;
            else if (c.getDurationMillis() >= 0) ms.add(c.getDurationMillis());
        }

        // Outages over all checks, so one that began before the period is clipped, not lost.
        List<Outage> outages = new ArrayList<>();
        List<CheckResult> run = new ArrayList<>();
        for (CheckResult c : sorted) {
            if (c.inMaintenance()) continue;
            if (!c.isSuccess()) {
                run.add(c);
                continue;
            }
            if (!run.isEmpty()) {
                addClipped(outages, run, parse(c.getTimestamp()), from, periodEnd);
                run = new ArrayList<>();
            }
        }
        if (!run.isEmpty()) addClipped(outages, run, null, from, periodEnd);

        long downtime = 0;
        long longest = 0;
        for (Outage o : outages) {
            downtime += o.durationMs();
            longest = Math.max(longest, o.durationMs());
        }
        ms.sort(Long::compare);
        Double avg = ms.isEmpty() ? null : ms.stream().mapToLong(Long::longValue).average().orElse(0);
        Double p95 = ms.isEmpty() ? null : (double) ms.get(Math.min(ms.size() - 1, Math.max(0, (int) Math.ceil(0.95 * ms.size()) - 1)));
        Double availability = total == 0 ? null : (total - failed) * 100.0 / total;
        outages.sort(Comparator.comparing(Outage::start).reversed());
        return new Figures(total, failed, maint, availability, outages, downtime, longest, avg, p95);
    }

    private static void addClipped(List<Outage> out, List<CheckResult> run, LocalDateTime end, LocalDateTime from, LocalDateTime periodEnd) {
        LocalDateTime start = parse(run.get(0).getTimestamp());
        if (start == null) return;
        LocalDateTime realEnd = end != null ? end : periodEnd;
        if (!realEnd.isAfter(from) || !start.isBefore(periodEnd)) return;
        LocalDateTime s = start.isBefore(from) ? from : start;
        LocalDateTime e = realEnd.isAfter(periodEnd) ? periodEnd : realEnd;
        long d = Math.max(0, Duration.between(s, e).toMillis());
        CheckResult last = run.get(run.size() - 1);
        out.add(new Outage(start, end, d, run.size(), last.getMessage(), run.get(0).getTimestamp()));
    }

    public static String pct(Double p) {
        if (p == null) return "no data";
        return p >= 99.9999 ? "100%" : String.format(java.util.Locale.ROOT, "%.2f%%", p);
    }

    public static String ms(Double v) {
        if (v == null) return "—";
        return v >= 1000 ? String.format(java.util.Locale.ROOT, "%.2f s", v / 1000) : Math.round(v) + " ms";
    }
}
