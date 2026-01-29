import { MapViewState } from "@deck.gl/core"
import { create } from "zustand"

type MapStore = {
    viewState: MapViewState | null // If null, user controls map freely. If set, we might be flying.
    flyTo: (location: { latitude: number; longitude: number; zoom?: number; stationName?: string }) => void
}

// We essentially act as an event bus for flyTo commands.
// The Map component will subscribe to this.
type MapActions = {
    // We use a counter/timestamp to trigger effects even if coords are same
    flyToTrigger: number
    flyToTarget: { latitude: number; longitude: number; zoom: number; stationName?: string } | null
    triggerFlyTo: (location: { latitude: number; longitude: number; zoom?: number; stationName?: string }) => void
}

export const useMapStore = create<MapActions>((set) => ({
    flyToTrigger: 0,
    flyToTarget: null,
    triggerFlyTo: ({ latitude, longitude, zoom = 15, stationName }) => set((state) => ({
        flyToTrigger: state.flyToTrigger + 1,
        flyToTarget: { latitude, longitude, zoom, stationName }
    }))
}))
