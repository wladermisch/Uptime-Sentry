package com.uptimesentry.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.uptimesentry.model.CheckResult;
import com.uptimesentry.model.MaintenanceWindow;
import com.uptimesentry.model.MonitoredTarget;
import com.uptimesentry.model.ReportSchedule;
import com.uptimesentry.model.Webhook;

class NewFeaturesTest {

    private static MonitoredTarget target(int id, String profileId) {
        MonitoredTarget t = new MonitoredTarget(id, "T" + id, "HTTP", "https://example.com", 5, "", List.of());
        t.setProfileId(profileId);
        return t;
    }

    @Test
    void oneOffMaintenanceCoversItsPeriodOnly() {
        MaintenanceWindow w = new MaintenanceWindow();
        w.start = "2026-11-10T22:00";
        w.end = "2026-11-10T23:30";
        assertFalse(w.isActive(LocalDateTime.of(2026, 11, 10, 21, 59)));
        assertTrue(w.isActive(LocalDateTime.of(2026, 11, 10, 22, 0)));
        assertTrue(w.isActive(LocalDateTime.of(2026, 11, 10, 23, 29)));
        assertFalse(w.isActive(LocalDateTime.of(2026, 11, 10, 23, 30)));
        w.enabled = false;
        assertFalse(w.isActive(LocalDateTime.of(2026, 11, 10, 22, 30)));
    }

    @Test
    void weeklyMaintenanceRunsPastMidnight() {
        MaintenanceWindow w = new MaintenanceWindow();
        w.mode = "WEEKLY";
        w.days = List.of(6); // Saturday
        w.startTime = "23:00";
        w.endTime = "02:00";
        // 2026-11-14 is a Saturday.
        assertTrue(w.isActive(LocalDateTime.of(2026, 11, 14, 23, 30)));
        assertTrue(w.isActive(LocalDateTime.of(2026, 11, 15, 1, 59)));
        assertFalse(w.isActive(LocalDateTime.of(2026, 11, 15, 2, 0)));
        assertFalse(w.isActive(LocalDateTime.of(2026, 11, 13, 23, 30)));
        assertEquals(LocalDateTime.of(2026, 11, 14, 23, 0), w.nextStart(LocalDateTime.of(2026, 11, 12, 9, 0)));
    }

    @Test
    void maintenanceScope() {
        MaintenanceWindow w = new MaintenanceWindow();
        assertTrue(w.covers(target(1, "a")));
        w.scope = "PROFILE";
        w.profileId = "a";
        assertTrue(w.covers(target(1, "a")));
        assertFalse(w.covers(target(2, "b")));
        w.scope = "TARGETS";
        w.targetIds = List.of(2);
        assertFalse(w.covers(target(1, "a")));
        assertTrue(w.covers(target(2, "b")));
    }

    @Test
    void schedulesFallDueAndCoverThePeriodBefore() {
        ReportSchedule s = new ReportSchedule();
        s.frequency = "WEEKLY";
        s.dayOfWeek = 1; // Monday
        s.time = "08:00";
        LocalDateTime wed = LocalDateTime.of(2026, 11, 11, 12, 0);
        assertEquals(LocalDateTime.of(2026, 11, 9, 8, 0), s.lastDue(wed));
        assertEquals(LocalDateTime.of(2026, 11, 16, 8, 0), s.nextDue(wed));
        LocalDateTime[] p = s.periodFor(LocalDateTime.of(2026, 11, 9, 8, 0));
        assertEquals(LocalDateTime.of(2026, 11, 2, 0, 0), p[0]);
        assertEquals(LocalDateTime.of(2026, 11, 9, 0, 0), p[1]);

        s.frequency = "MONTHLY";
        s.dayOfMonth = 1;
        p = s.periodFor(LocalDateTime.of(2026, 12, 1, 8, 0));
        assertEquals(LocalDateTime.of(2026, 11, 1, 0, 0), p[0]);
        assertEquals(LocalDateTime.of(2026, 12, 1, 0, 0), p[1]);

        s.frequency = "DAILY";
        assertEquals(LocalDateTime.of(2026, 11, 10, 8, 0), s.lastDue(LocalDateTime.of(2026, 11, 11, 7, 59)));
    }

    private static CheckResult check(String ts, boolean ok, long ms, boolean maintenance) {
        CheckResult c = new CheckResult(1, "T1", ts, ok, ok ? ms : -1, ok ? "HTTP 200" : "HTTP 503");
        c.setMaintenance(maintenance);
        return c;
    }

    @Test
    void statsLeaveMaintenanceOutAndClipOutages() {
        List<CheckResult> checks = List.of(
            check("2026-11-09 23:50:00", false, 0, false), // outage starts before the period
            check("2026-11-10 00:10:00", true, 100, false),
            check("2026-11-10 10:00:00", false, 0, true),  // maintenance: ignored
            check("2026-11-10 10:05:00", true, 300, false),
            check("2026-11-10 12:00:00", false, 0, false),
            check("2026-11-10 12:30:00", true, 200, false));
        UptimeStats.Figures f = UptimeStats.compute(checks, LocalDateTime.of(2026, 11, 10, 0, 0), LocalDateTime.of(2026, 11, 11, 0, 0),
            LocalDateTime.of(2026, 11, 12, 0, 0));
        assertEquals(4, f.checks());
        assertEquals(1, f.failed());
        assertEquals(1, f.maintenanceChecks());
        assertEquals(75.0, f.availability(), 0.001);
        assertEquals(2, f.outages().size());
        assertEquals((10 + 30) * 60_000L, f.downtimeMs());
        assertEquals(200.0, f.avgMs(), 0.001);
    }

    @Test
    void statsWithoutChecksHaveNoAvailability() {
        UptimeStats.Figures f = UptimeStats.compute(List.of(), LocalDateTime.of(2026, 11, 10, 0, 0), LocalDateTime.of(2026, 11, 11, 0, 0), LocalDateTime.now());
        assertNull(f.availability());
        assertEquals("no data", UptimeStats.pct(f.availability()));
    }

    @Test
    void webhookFiltersByEventAndProfile() {
        Webhook w = new Webhook();
        w.url = "https://example.com/hook";
        w.events = List.of("DOWN");
        assertTrue(w.wants("DOWN", target(1, "a")));
        assertFalse(w.wants("UP", target(1, "a")));
        w.profileIds = List.of("b");
        assertFalse(w.wants("DOWN", target(1, "a")));
        assertTrue(w.wants("DOWN", target(2, "b")));
        w.enabled = false;
        assertFalse(w.wants("DOWN", target(2, "b")));
    }

    @Test
    void reportHtmlEscapesNames() {
        assertEquals("&lt;b&gt;x&amp;y&quot;", ReportScheduler.esc("<b>x&y\""));
    }
}
