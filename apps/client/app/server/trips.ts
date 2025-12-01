"use server";

import { prisma } from "@bikemap/db";

// June 8, 2025 10:00 AM - 12:00 PM (peak commute)
const START_TIME = new Date("2025-06-08T10:00:00.000Z");
const END_TIME = new Date("2025-06-08T12:00:00.000Z");

export async function getActiveRides() {
  // Trips that ended within the window:
  const trips = await prisma.trip.findMany({
    where: {
      startedAt: { lt: END_TIME },   // trip started before window ends
      endedAt: { gt: START_TIME },   // trip ended after window starts
    },
    orderBy: { startedAt: "asc" },
  });

  return {
    startTime: START_TIME.toISOString(),
    endTime: END_TIME.toISOString(),
    count: trips.length,
    trips,
  };
}
