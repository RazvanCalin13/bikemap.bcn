"use client"
import { getStations, getTripsFromStation } from "@/app/server/trips"
import { EBike } from "@/components/icons/Ebike"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { REFERENCE_DATE } from "@/lib/config"
import { usePickerStore } from "@/lib/store"
import distance from "@turf/distance"
import { point } from "@turf/helpers"
import * as chrono from "chrono-node"
import { Fzf } from "fzf"
import { ArrowLeft, ArrowRight, Bike, CalendarSearch, Clock, MapPin, X } from "lucide-react"
import React from "react"

type Station = {
  ids: string[]
  name: string
  latitude: number
  longitude: number
}

type StationWithDistance = Station & { distance: number }

type Trip = {
  id: string
  startStationId: string
  endStationId: string
  startedAt: Date
  endedAt: Date
  rideableType: string
  memberCasual: string
}

type SearchStep = "station" | "datetime" | "results"

const MAX_RESULTS = 10

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`
  }
  return `${(meters / 1000).toFixed(1)}km`
}

function formatDateTime(date: Date): string {
  const currentYear = new Date().getFullYear()
  const dateYear = date.getFullYear()

  return date.toLocaleString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: dateYear !== currentYear ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDuration(startedAt: Date, endedAt: Date): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function getStationName(stationId: string, stations: Station[]): string {
  const station = stations.find((s) => s.ids.includes(stationId))
  return station?.name ?? stationId
}

export function Search() {
  const [open, setOpen] = React.useState(false)
  const [stations, setStations] = React.useState<Station[]>([])
  const [search, setSearch] = React.useState("")

  // Multi-step flow state
  const [step, setStep] = React.useState<SearchStep>("station")
  const [selectedStation, setSelectedStation] = React.useState<Station | null>(null)
  const [datetimeInput, setDatetimeInput] = React.useState("")
  const [trips, setTrips] = React.useState<Trip[]>([])

  const { pickedLocation, startPicking, clearPicking } = usePickerStore()

  // Parse datetime with chrono
  const parsedDate = React.useMemo(() => {
    if (!datetimeInput.trim()) return null
    return chrono.parseDate(datetimeInput, REFERENCE_DATE)
  }, [datetimeInput])

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  React.useEffect(() => {
    getStations().then(setStations)
  }, [])

  // Re-open dialog when location is picked
  React.useEffect(() => {
    if (pickedLocation) {
      setOpen(true)
    }
  }, [pickedLocation])

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setStep("station")
      setSelectedStation(null)
      setDatetimeInput("")
      setSearch("")
      setTrips([])
    }
  }

  const fzf = React.useMemo(
    () => new Fzf(stations, { selector: (s) => s.name }),
    [stations]
  )

  const filteredStations = React.useMemo((): (Station | StationWithDistance)[] => {
    // If we have a picked location, sort by distance
    if (pickedLocation) {
      const pickedPoint = point([pickedLocation.lng, pickedLocation.lat])
      const withDistance = stations.map((s) => ({
        ...s,
        distance: distance(pickedPoint, point([s.longitude, s.latitude]), { units: "meters" }),
      }))
      withDistance.sort((a, b) => a.distance - b.distance)

      // If there's a search query, filter by name too
      if (search.trim()) {
        const matchingNames = new Set(
          fzf.find(search.trim()).map((r) => r.item.name)
        )
        return withDistance.filter((s) => matchingNames.has(s.name)).slice(0, MAX_RESULTS)
      }

      return withDistance.slice(0, MAX_RESULTS)
    }

    // Normal fuzzy search
    const query = search.trim()
    if (!query) return stations.slice(0, MAX_RESULTS)
    return fzf.find(query).slice(0, MAX_RESULTS).map((result) => result.item)
  }, [stations, search, fzf, pickedLocation])

  const handlePickFromMap = () => {
    setOpen(false)
    startPicking()
  }

  const handleClearLocation = () => {
    clearPicking()
  }

  const handleSelectStation = (station: Station | StationWithDistance) => {
    setSelectedStation(station)
    setStep("datetime")
    setSearch("")
  }

  const handleBackToStation = () => {
    setStep("station")
    setSelectedStation(null)
    setDatetimeInput("")
    setTrips([])
  }

  const handleBackToDatetime = () => {
    setStep("datetime")
    setTrips([])
  }

  const handleConfirmSelection = async () => {
    if (selectedStation && parsedDate) {
      const result = await getTripsFromStation({
        startStationIds: selectedStation.ids,
        datetime: parsedDate,
        intervalSeconds: 1800,
      })
      setTrips(result.trips)
      setStep("results")
    }
  }

  const handleSelectTrip = (trip: Trip) => {
    console.log("Selected trip:", trip)
    handleOpenChange(false)
  }

  // Render datetime step
  if (step === "datetime" && selectedStation) {
    return (
      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <button
            onClick={handleBackToStation}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <Bike className="size-4 text-muted-foreground" />
          <span className="font-medium">{selectedStation.name}</span>
        </div>
        <CommandInput
          autoFocus
          placeholder="When did this ride start?"
          value={datetimeInput}
          onValueChange={setDatetimeInput}
          icon={<CalendarSearch className="size-4 shrink-0 text-muted-foreground" />}
        />
        <CommandList>
          {parsedDate && (
            <CommandGroup>
              <CommandItem onSelect={handleConfirmSelection} className="bg-accent">
                <ArrowRight className="size-4" />
                {formatDateTime(parsedDate)}
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    )
  }

  // Render results step
  if (step === "results" && selectedStation) {
    return (
      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <button
            onClick={handleBackToDatetime}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="font-medium">
            {trips.length} ride{trips.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <CommandList>
          <CommandGroup>
            {trips.map((trip) => (
              <CommandItem key={trip.id} onSelect={() => handleSelectTrip(trip)}>
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center gap-2">
                    <Clock className="size-3 text-muted-foreground" />
                    <span className="font-medium tabular-nums w-20">{formatTime(trip.startedAt)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground tabular-nums w-12">{formatDuration(trip.startedAt, trip.endedAt)}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {trip.rideableType === "electric_bike" ? (
                        <EBike className="size-4 text-[#7DCFFF]" />
                      ) : (
                        <Bike className="size-4 text-[#BB9AF7]" />
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getStationName(trip.startStationId, stations)} → {getStationName(trip.endStationId, stations)}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    )
  }

  // Render station step (default)
  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder={pickedLocation ? "Filter nearby stations..." : "Type a station name..."}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          {pickedLocation ? (
            <CommandItem onSelect={handleClearLocation}>
              <X className="size-4" />
              Clear picked location
            </CommandItem>
          ) : (
            <CommandItem onSelect={handlePickFromMap}>
              <MapPin className="size-4" />
              Pick location from map
            </CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={pickedLocation ? "Nearest Stations" : "Citibike Stations"}>
          {filteredStations.map((station) => (
            <CommandItem
              key={station.name}
              value={station.name}
              onSelect={() => handleSelectStation(station)}
            >
              <Bike className="size-4" />
              <span className="flex-1">{station.name}</span>
              {"distance" in station && (
                <span className="text-muted-foreground text-xs">
                  {formatDistance(station.distance)}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
