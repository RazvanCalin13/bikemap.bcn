import { describe, expect, it } from "vitest";
import { formatDistance, formatSpeedKmh, formatTimeOnly } from "./format";

describe("Barcelona Formatting", () => {
    it("should format distances in meters and kilometers", () => {
        expect(formatDistance(500)).toBe("500 m");
        expect(formatDistance(1500)).toBe("1.5 km");
        expect(formatDistance(1000)).toBe("1.0 km");
    });

    it("should format time in Europe/Madrid timezone", () => {
        const date = new Date("2026-01-29T10:00:00Z"); // UTC
        // Madrid is UTC+1 in winter
        const timeStr = formatTimeOnly(date.getTime());
        expect(timeStr).toContain("11:00");
    });

    it("should format speed in km/h", () => {
        const startedAt = new Date("2026-01-29T10:00:00Z");
        const endedAt = new Date("2026-01-29T11:00:00Z"); // 1 hour
        const speed = formatSpeedKmh({
            distanceMeters: 15000, // 15 km
            startedAt,
            endedAt,
        });
        expect(speed).toBe("15.0 km/h");
    });
});
