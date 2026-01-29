// =============================================================================
// Animation Defaults
// =============================================================================

import { Color, MapViewState } from "@deck.gl/core";

// Default animation start date (Barcelona time)
export const DEFAULT_ANIMATION_START_DATE = new Date("2025-01-01T09:41:00+01:00"); // CET

// Valid data range for Bicing data (Barcelona time)
// Modern Bicing (Smou) started around 2019
export const DATA_START_DATE = new Date("2019-01-01T00:00:00+01:00"); // CET
export const DATA_END_DATE = new Date("2026-12-31T23:59:59+01:00");   // CET

// Default speedup multiplier for animation
export const DEFAULT_SPEEDUP = 150 * 1;

// =============================================================================
// Data Pipeline (batch/chunk sizing) - simulation time
// =============================================================================

// Chunk: how often deck.gl rebuilds geometry
export const SIM_CHUNK_SIZE_MS = 60 * 1000; // 1 minute

// Batch: how often we fetch from API + worker processes trips
export const SIM_BATCH_SIZE_MS = 30 * 60 * 1000; // 30 minutes

export const CHUNKS_PER_BATCH = SIM_BATCH_SIZE_MS / SIM_CHUNK_SIZE_MS;

// Prefetch config - start prefetching next batch at 50% through current batch
export const PREFETCH_THRESHOLD_CHUNKS = Math.floor(CHUNKS_PER_BATCH * 0.5);

// Number of batches to prefetch ahead (for slow connections / high speedup)
export const NUM_LOOKAHEAD_BATCHES = 2;

// =============================================================================
// Rendering (visual tuning)
// =============================================================================

export const SIM_TRAIL_LENGTH_MS = 1.5 * 45 * 1000; // simulation time
export const EASE_DISTANCE_METERS = 300;
export const EASE_TIME_MULTIPLIER = 2; // How much longer ease zones take vs linear (2 = twice as slow)

// Fade duration in real-time milliseconds (multiplied by speedup at usage)
export const REAL_FADE_DURATION_MS = 700;
export const REAL_COLOR_TRANSITION_MS = 700; // Color transition during movement (green -> bike color)

// Max frame delta to prevent time jumps when returning from background tab (100ms = 10 FPS minimum)
export const REAL_MAX_FRAME_DELTA_MS = 100;

// =============================================================================
// Map Configuration
// =============================================================================

export const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 2.1734,
  latitude: 41.3851,
  zoom: 13,
  pitch: 0,
  bearing: 0,
};

// =============================================================================
// Graph Configuration
// =============================================================================

export const SIM_GRAPH_WINDOW_SIZE_MS = 3 * 60 * 60 * 1000; // 3-hour rolling window (simulation time)
export const GRAPH_MIN_SCALE = 100; // Minimum Y-axis scale (avoid jitter)

// =============================================================================
// Colors (RGB tuples)
// =============================================================================

// Occupancy Colors
export const COLORS = {
  occupancy: {
    empty: [255, 50, 50],    // Red (0% bikes)
    low: [255, 165, 0],      // Orange (Low bikes)
    medium: [255, 255, 0],   // Yellow (Half full)
    high: [80, 200, 120],    // Green (Full)
    full: [0, 255, 255],     // Cyan (100% bikes / 0% docks) -> Optional
  },
  electric: [125, 207, 255], // E-bike blue
  classic: [187, 154, 247],  // Classic bike purple
  fadeIn: [255, 255, 255],   // White
  fadeOut: [150, 150, 150],  // Grey
} as const satisfies Record<string, any>;

export const CAMERA_POLLING_INTERVAL_MS = 250;

// Estimated total Bicing fleet size (for determining active bikes)
export const ESTIMATED_TOTAL_FLEET = 7000;