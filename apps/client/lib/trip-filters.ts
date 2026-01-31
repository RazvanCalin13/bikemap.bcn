import type { TripWithRoute } from "./trip-types";

/**
 * Filters trips to only include those that can be rendered on the map.
 * Used by both Search (getTripsFromStation) and BikeMap (prepareTripsForDeck).
 *
 * Criteria:
 * 1. Must have valid start and end coordinates
 * 2. Can't be same-station trip
 */
export function filterTrips<T extends TripWithRoute>(trips: T[]): T[] {
  return trips.filter((trip) => {
    // Must have valid coordinates
    if (
      trip.startLat === null ||
      trip.startLng === null ||
      trip.endLat === null ||
      trip.endLng === null
    ) {
      return false;
    }

    // Can't be same-station trip
    if (trip.startStationName === trip.endStationName) return false;

    return true;
  });
}
