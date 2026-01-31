import { create } from "zustand";
import { DEFAULT_ANIMATION_START_DATE, DEFAULT_SPEEDUP } from "../config";
import { usePickerStore } from "./location-picker-store";

export type AnimationStore = {
  // Source config only
  speedup: number
  animationStartDate: Date

  // Playback
  isPlaying: boolean
  simCurrentTimeMs: number // simulation ms from windowStart
  pendingAutoPlay: boolean // flag to auto-play after data loads

  // Config triggers
  dateSelectionKey: number // Increments on each date selection to force config reload

  // Actions
  setSpeedup: (value: number) => void
  setAnimationStartDate: (date: Date) => void
  setAnimationStartDateAndPlay: (date: Date) => void
  clearPendingAutoPlay: () => void
  play: () => void
  pause: () => void
  setSimCurrentTimeMs: (simTimeMs: number) => void
  advanceSimTime: (deltaMs: number) => void
  resetPlayback: () => void
}

export const useAnimationStore = create<AnimationStore>((set) => ({
  // Config
  speedup: DEFAULT_SPEEDUP,
  animationStartDate: DEFAULT_ANIMATION_START_DATE,

  // Playback
  isPlaying: false,
  simCurrentTimeMs: 0,
  pendingAutoPlay: true, // Auto-play on initial page load

  // Config triggers
  dateSelectionKey: 0,

  // Config actions (reset playback when config changes)
  setSpeedup: (speedup) => set({ speedup }),
  setAnimationStartDate: (animationStartDate) => set((state) => ({
    animationStartDate,
    isPlaying: false,
    simCurrentTimeMs: 0,
    dateSelectionKey: state.dateSelectionKey + 1,
  })),
  setAnimationStartDateAndPlay: (animationStartDate) => set((state) => ({
    animationStartDate,
    isPlaying: false,
    simCurrentTimeMs: 0,
    pendingAutoPlay: true,
    dateSelectionKey: state.dateSelectionKey + 1,
  })),
  clearPendingAutoPlay: () => set({ pendingAutoPlay: false }),

  // Playback actions
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setSimCurrentTimeMs: (simCurrentTimeMs) => set({ simCurrentTimeMs }),
  advanceSimTime: (deltaMs) => set((state) => ({ simCurrentTimeMs: state.simCurrentTimeMs + deltaMs })),
  resetPlayback: () => set({ isPlaying: false, simCurrentTimeMs: 0 }),
}))
