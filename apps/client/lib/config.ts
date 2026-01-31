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
export const DEFAULT_SPEEDUP = 300; // 5 minutes per second (300x)

// Playback speed levels (simulation milliseconds per real second)
// 300 = 5 min/s
// 900 = 15 min/s
// 3600 = 1 hour/s
// 14400 = 4 hours/s
export const SPEED_LEVELS = [300, 900, 3600, 14400];

// =============================================================================
// Rendering (visual tuning)
// =============================================================================

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

export const SIM_GRAPH_WINDOW_SIZE_MS = 6 * 60 * 60 * 1000; // 6-hour rolling window (simulation time)
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