import { create } from "zustand"

export type Station = {
  ids: string[]
  name: string
  aliases: string[] // Historical names for search matching
  latitude: number
  longitude: number
  borough: string
  neighborhood: string
}

type StationsState = {
  stations: Station[]
  stationByName: Map<string, Station> // name -> station (names are unique)
  stationById: Map<string, Station> // id -> station (for backwards compat)
  isLoading: boolean
  load: () => Promise<void>
  getStation: (name: string) => Station
  getStationById: (id: string) => Station
}

export const useStationsStore = create<StationsState>((set, get) => ({
  stations: [],
  stationByName: new Map(),
  stationById: new Map(),
  isLoading: false,
  load: async () => {
    if (get().stations.length > 0 || get().isLoading) return
    set({ isLoading: true })
    const stations: Station[] = await fetch("/stations.json").then((r) => r.json())
    const stationByName = new Map<string, Station>()
    const stationById = new Map<string, Station>()
    for (const station of stations) {
      stationByName.set(station.name, station)
      for (const id of station.ids) {
        stationById.set(id, station)
      }
    }
    set({ stations, stationByName, stationById, isLoading: false })
  },
  // Primary lookup by name (station names are unique)
  getStation: (name: string) => {
    const station = get().stationByName.get(name)
    if (!station) {
      throw new Error(`Station not found by name: ${name}`)
    }
    return station
  },
  // Legacy lookup by ID (for search flow which uses station.ids)
  getStationById: (id: string) => {
    const station = get().stationById.get(id)
    if (!station) {
      throw new Error(`Station not found by id: ${id}`)
    }
    return station
  },
}))
