// Shared types for trip processing between main thread and worker

export type Phase = "fading-in" | "moving" | "fading-out";

// DeckGL TripsLayer data format
export type DeckTrip = {
  id: string;
  path: [number, number][];
  timestamps: number[]; // seconds from window start
  bikeType: string;
  startTimeSeconds: number; // actual trip start (movement begins after transition)
  endTimeSeconds: number; // actual trip end (movement stops, fade-out begins)
  visibleStartSeconds: number; // when bike first appears (fade-in starts)
  visibleEndSeconds: number; // when bike disappears (fade-out ends)
  cumulativeDistances: number[]; // meters from route start
  lastSegmentIndex: number; // cached cursor for O(1) segment lookup
  // Precomputed phase boundary (avoid recalculating each frame)
  fadeInEndSeconds: number;
  // Precomputed bearings for stationary phases
  firstSegmentBearing: number;
  lastSegmentBearing: number;
  // Mutable state (initialized by worker, updated by main thread each frame)
  currentPosition: [number, number];
  currentBearing: number;
  currentPhase: Phase;
  currentPhaseProgress: number;
  isVisible: boolean;
  isSelected: boolean;
};

// Raw trip from server (serializable for worker transfer)
// Dates become ISO strings when sent via postMessage
export type RawTrip = {
  id: string;
  startStationId: string;
  endStationId: string;
  startedAt: string; // ISO string
  endedAt: string; // ISO string
  rideableType: string;
  memberCasual: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  routeGeometry: string | null;
  routeDistance: number | null;
  routeDuration: number | null;
};

// Trip type with Date objects (from server before serialization)
export type ServerTrip = Omit<RawTrip, "startedAt" | "endedAt"> & {
  startedAt: Date;
  endedAt: Date;
};
