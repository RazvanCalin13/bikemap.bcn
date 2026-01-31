"use client";

import { EBike } from "@/components/icons/Ebike"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { EnterHint, Kbd } from "@/components/ui/kbd"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DATA_END_DATE, DATA_START_DATE } from "@/lib/config"
import { formatDateTime, formatDateTimeShort, formatDistance } from "@/lib/format"
import { useAnimationStore } from "@/lib/stores/animation-store"
import { usePickerStore } from "@/lib/stores/location-picker-store"
import { useSearchStore } from "@/lib/stores/search-store"
import { useMapStore } from "@/lib/stores/map-store"
import { useStationsStore, type Station } from "@/lib/stores/stations-store"
import { cn } from "@/lib/utils"
import distance from "@turf/distance"
import { point } from "@turf/helpers"
import * as chrono from "chrono-node"
import { Fzf } from "fzf"
import { ArrowLeft, ArrowRight, Bike, CalendarSearch, History, MapPin, Search as SearchIcon, AlertCircle } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import dataManifest from "@/lib/data-manifest.json"

type SearchMode = "ride" | "time"

type StationWithDistance = Station & { distance: number }

const MAX_RESULTS = 15

export function Search() {
  const { isOpen, open: openSearch, toggle, close, step, setStep, datetimeHistory, addToHistory } = useSearchStore()
  const [search, setSearch] = React.useState("")

  // Mode switching (ride search vs time jump)
  const [mode, setMode] = React.useState<SearchMode>("time")

  // Multi-step flow state
  const [selectedStation, setSelectedStation] = React.useState<Station | null>(null)
  const [datetimeInput, setDatetimeInput] = React.useState("")

  // History navigation state
  const [historyIndex, setHistoryIndex] = React.useState(-1)
  const [savedInput, setSavedInput] = React.useState("")

  const { pickedLocation, startPicking } = usePickerStore()
  const { animationStartDate, simCurrentTimeMs } = useAnimationStore()
  const { stations, load: loadStations } = useStationsStore()
  const { triggerFlyTo } = useMapStore()

  const formattedMonths = React.useMemo(() => {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(dataManifest.months)
  }, [])

  // Compute current real time (absolute) for chrono reference
  const realCurrentTimeMs = React.useMemo(() => {
    return new Date(animationStartDate.getTime() + simCurrentTimeMs)
  }, [animationStartDate, simCurrentTimeMs])

  // Parse datetime with chrono - uses current real time as reference for relative dates like "now"
  const parsedDate = React.useMemo(() => {
    const input = datetimeInput.trim().toLowerCase()
    if (!input) return null
    if (input === "live" || input === "now") return new Date()
    return chrono.parseDate(datetimeInput, realCurrentTimeMs)
  }, [datetimeInput, realCurrentTimeMs])

  // Check if parsed date is outside available data range
  const isDateOutOfRange = React.useMemo(() => {
    if (!parsedDate) return false

    // Check bounds
    if (parsedDate < DATA_START_DATE || parsedDate > DATA_END_DATE) return true

    // Check if month exists in manifest
    const monthName = parsedDate.toLocaleString('en-US', { month: 'long' })
    if (!(dataManifest.months as string[]).includes(monthName)) return true

    return false
  }, [parsedDate])

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggle()
      }
      // Tab to switch modes (only when dialog is open and on datetime step)
      if (e.key === "Tab" && isOpen && step === "datetime") {
        e.preventDefault()
        setMode((m) => (m === "ride" ? "time" : "ride"))
        // Re-focus the input after mode switch
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('[cmdk-input]')
          input?.focus()
        }, 0)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [toggle, isOpen, step])

  // Handle Esc key: go back to previous step instead of closing dialog
  const handleEscapeKeyDown = React.useCallback((e: KeyboardEvent) => {
    if (step === "station") {
      e.preventDefault()
      setStep("datetime")
      setSearch("")
      focusInput()
    }
    // step === "datetime" falls through to default dialog close behavior
  }, [step, setStep])

  React.useEffect(() => {
    loadStations()
  }, [loadStations])

  // Get display label for station (neighborhood, borough)
  const getStationRegionLabel = React.useCallback(
    (station: Station): string => {
      if (station.neighborhood.toLowerCase() === station.borough.toLowerCase()) {
        return station.neighborhood
      }
      return `${station.neighborhood}, ${station.borough}`
    },
    []
  )

  // Re-open dialog when location is picked
  React.useEffect(() => {
    if (pickedLocation) {
      openSearch()
    }
  }, [pickedLocation, openSearch])

  // Sync initial input with current app time when opening (snapshot)
  // And clear it when switching to "ride" mode
  React.useEffect(() => {
    if (isOpen && step === "datetime") {
      if (mode === "time") {
        const currentDate = new Date(animationStartDate.getTime() + simCurrentTimeMs)
        setDatetimeInput(formatDateTimeShort(currentDate))
      } else {
        // "Find station" mode starts empty
        setDatetimeInput("")
      }
    }
  }, [isOpen, step, mode]) // Removed simCurrentTimeMs to prevent auto-updates while open

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      openSearch()
    } else {
      close()
      setStep("datetime")
      setSelectedStation(null)
      setDatetimeInput("")
      setSearch("")
      setHistoryIndex(-1)
      setSavedInput("")
    }
  }

  const nameFzf = React.useMemo(
    () => new Fzf(stations, { selector: (s) => s.name }),
    [stations]
  )

  const neighborhoodFzf = React.useMemo(
    () =>
      new Fzf(stations, {
        selector: (s) => s.neighborhood,
      }),
    [stations]
  )

  // Alias search: expand stations into (station, alias) pairs for fuzzy matching
  // This allows searching for historical station names while still returning the canonical station
  const aliasEntries = React.useMemo(
    () => stations.flatMap((s) => s.aliases.map((alias) => ({ station: s, alias }))),
    [stations]
  )
  const aliasFzf = React.useMemo(
    () => new Fzf(aliasEntries, { selector: (e) => e.alias }),
    [aliasEntries]
  )

  const filteredStations = React.useMemo((): (Station | StationWithDistance)[] => {
    // Determine the active query based on the current step
    const query = (step === "datetime" ? datetimeInput : search).trim()

    // Helper to merge results from name, neighborhood, and alias fzf instances
    const getMergedMatches = (q: string): Station[] => {
      const trimQuery = q.trim()
      const lowerQuery = trimQuery.toLowerCase()
      if (!trimQuery) return []

      // 0. Exact Alias/ID Matches (Top Priority)
      const exactAliasMatches = stations.filter((s) => s.aliases.includes(trimQuery))

      // 1. Direct Name Substring Matches (High Priority for "C/ Marina" vs "Marina")
      // Sort by: Starts with query > Match index > Length
      const substringMatches = stations.filter((s) =>
        s.name.toLowerCase().includes(lowerQuery)
      ).sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        const aIndex = aName.indexOf(lowerQuery)
        const bIndex = bName.indexOf(lowerQuery)
        if (aIndex !== bIndex) return aIndex - bIndex // Earlier match is better
        return a.name.length - b.name.length // Shorter string is better (closer match)
      })

      const nameMatches = nameFzf.find(q).map((r) => r.item)
      const neighborhoodMatches = neighborhoodFzf.find(q).map((r) => r.item)
      // Alias matches return the canonical station (not the alias text)
      const aliasMatches = aliasFzf.find(q).map((r) => r.item.station)

      const seen = new Set<string>()
      const merged: Station[] = []

      // Add exact matches first
      for (const station of exactAliasMatches) {
        if (!seen.has(station.name)) {
          seen.add(station.name)
          merged.push(station)
        }
      }

      // Add substring matches next
      for (const station of substringMatches) {
        if (!seen.has(station.name)) {
          seen.add(station.name)
          merged.push(station)
        }
      }

      // Priority: name matches first, then neighborhood, then alias
      for (const station of [...nameMatches, ...neighborhoodMatches, ...aliasMatches]) {
        if (!seen.has(station.name)) {
          seen.add(station.name)
          merged.push(station)
        }
      }

      return merged
    }

    // If we have a picked location, sort by distance
    if (pickedLocation) {
      const pickedPoint = point([pickedLocation.lng, pickedLocation.lat])
      const withDistance = stations.map((s) => ({
        ...s,
        distance: distance(pickedPoint, point([s.longitude, s.latitude]), { units: "meters" }),
      }))
      withDistance.sort((a, b) => a.distance - b.distance)

      // If there's a search query, filter by merged matches
      if (query) {
        const matchingNames = new Set(getMergedMatches(query).map((s) => s.name))
        return withDistance.filter((s) => matchingNames.has(s.name)).slice(0, MAX_RESULTS)
      }

      return withDistance.slice(0, MAX_RESULTS)
    }

    // Normal fuzzy search
    if (!query) return stations.slice(0, MAX_RESULTS)
    return getMergedMatches(query).slice(0, MAX_RESULTS)
  }, [stations, search, datetimeInput, step, nameFzf, neighborhoodFzf, aliasFzf, pickedLocation])

  const handlePickFromMap = () => {
    close()
    startPicking()
  }


  const handleSelectStation = async (station: Station | StationWithDistance) => {
    // Zoom to station
    triggerFlyTo({
      latitude: station.latitude,
      longitude: station.longitude,
      zoom: 16,
      stationName: station.name
    })

    close()
  }

  // Focus the command input after step transitions
  const focusInput = () => {
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[cmdk-input]')
      input?.focus()
    }, 0)
  }

  // From station step, go back to datetime step
  const handleBackToDatetime = () => {
    setStep("datetime")
    setSearch("")
    focusInput()
  }

  const handleConfirmDatetime = () => {
    if (parsedDate) {
      addToHistory(datetimeInput)
      setHistoryIndex(-1)
      setSavedInput("")
      setSearch("") // Clear station search for fresh input
      setStep("station")
      focusInput()
    }
  }

  const handleJumpToTime = () => {
    if (!parsedDate) return
    addToHistory(datetimeInput)
    setHistoryIndex(-1)
    setSavedInput("")
    useAnimationStore.getState().setAnimationStartDateAndPlay(parsedDate)

    // If user asked for "live" or "now", set speed to 1 (real-time).
    // Otherwise set to default fast speed (300x) for history viewing.
    const input = datetimeInput.trim().toLowerCase()
    const isLiveRequest = input === "live" || input === "now"
    useAnimationStore.getState().setSpeedup(isLiveRequest ? 1 : 300)

    handleOpenChange(false)
  }

  // Handle up/down arrow keys for history navigation
  const handleDatetimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (datetimeHistory.length === 0) return
      if (historyIndex === -1) {
        // Save current input before navigating
        setSavedInput(datetimeInput)
      }
      const newIndex = Math.min(historyIndex + 1, datetimeHistory.length - 1)
      setHistoryIndex(newIndex)
      setDatetimeInput(datetimeHistory[newIndex])
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIndex === -1) return
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      if (newIndex === -1) {
        // Restore saved input
        setDatetimeInput(savedInput)
      } else {
        setDatetimeInput(datetimeHistory[newIndex])
      }
    }
  }

  // Reset history navigation when input changes manually
  const handleDatetimeChange = (value: string) => {
    setDatetimeInput(value)
    setHistoryIndex(-1)
  }

  // Render datetime step (first step - no station selected yet)
  if (step === "datetime") {
    return (
      <CommandDialog open={isOpen} onOpenChange={handleOpenChange} onEscapeKeyDown={handleEscapeKeyDown} shouldFilter={false} className="sm:max-w-xl">
        <div className="flex items-center px-3 py-2 border-b pr-10">
          <Tabs value={mode} onValueChange={(v) => setMode(v as SearchMode)} >
            <TabsList className="bg-[#1c1c1f] h-10 sm:h-9">
              <TabsTrigger value="time" className="data-[state=active]:bg-zinc-800 px-3 py-1.5 sm:px-2 sm:py-1">
                <History className="size-4 sm:size-3.5" />
                Time travel
              </TabsTrigger>
              <TabsTrigger value="ride" className="data-[state=active]:bg-zinc-800 px-3 py-1.5 sm:px-2 sm:py-1">
                <SearchIcon className="size-4 sm:size-3.5" />
                Find station
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="hidden sm:flex text-xs text-muted-foreground items-center gap-1 ml-3">
            <Kbd>Tab</Kbd> to switch
          </span>
        </div>
        <CommandInput
          autoFocus
          placeholder={mode === "ride" ? "Enter the Bike Station ID or Street Name" : "What time do you want to jump to?"}
          value={datetimeInput}
          onValueChange={handleDatetimeChange}
          onKeyDown={handleDatetimeKeyDown}
          icon={mode === "ride" ? <SearchIcon className="size-4 shrink-0 text-muted-foreground" /> : <CalendarSearch className="size-4 shrink-0 text-muted-foreground" />}
        />
        <div className="px-3 py-2 text-sm sm:text-xs text-zinc-500 flex flex-col gap-0.5">
          <span>
            <span className="hidden sm:inline">Processed <a href="https://www.bicing.barcelona/" target="_blank" className="underline hover:text-zinc-50 text-zinc-300 font-medium">Bicing</a> data from the past Year</span>
            <span className="sm:hidden"><a href="https://www.bicing.barcelona/" target="_blank" className="underline hover:text-zinc-50 text-zinc-300 font-medium">Bicing</a> data from the past Year</span>
          </span>
          <span>{mode === "ride" ? 'Try something like "Marina" or "Bilbao"' : 'Try "July 4th 2019 at 8pm" or "Fri 4pm"'}</span>
        </div>
        <CommandList className="overflow-hidden">
          <AnimatePresence mode="wait">
            {parsedDate && (
              <motion.div
                key="parsed-date"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <CommandGroup heading={mode === "time" ? "Time travel" : "Time travel (search window start)"}>
                  <CommandItem
                    value="parsed-datetime"
                    onSelect={isDateOutOfRange ? undefined : (mode === "ride" ? handleConfirmDatetime : handleJumpToTime)}
                    className={cn("group bg-accent", isDateOutOfRange && "cursor-not-allowed")}
                    disabled={isDateOutOfRange}
                  >
                    {isDateOutOfRange ? (
                      <AlertCircle className="size-4 text-red-600" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {isDateOutOfRange ? (
                      <span className="text-red-600 font-bold">No Data Provided</span>
                    ) : (
                      <>
                        <span className="hidden sm:inline">{formatDateTime(parsedDate)}</span>
                        <span className="sm:hidden">{formatDateTimeShort(parsedDate)}</span>
                      </>
                    )}
                    <EnterHint className="ml-auto" />
                  </CommandItem>
                </CommandGroup>
              </motion.div>
            )}

            {/* Station results in Step 1 (only for ride mode) */}
            {mode === "ride" && datetimeInput.trim() && filteredStations.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Bicing Stations">
                  {filteredStations.map((station, index) => (
                    <motion.div
                      key={station.name}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut", delay: index * 0.05 }}
                    >
                      <CommandItem
                        value={`station-${station.name}`}
                        onSelect={() => {
                          // If user picked a station without a valid date yet, default to now
                          if (!parsedDate) {
                            // We can't really "select" a date without input, but we can default to now
                            // Chrono already defaults to now in the memo if input is empty, 
                            // but here input is NOT empty (it's the station name).
                            // So we just use realCurrentTimeMs.
                          }
                          handleSelectStation(station)
                        }}
                        className="group"
                      >
                        <Bike className="size-4" />
                        <div className="flex flex-col flex-1">
                          <span>{station.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {getStationRegionLabel(station)}
                          </span>
                        </div>
                        <EnterHint />
                      </CommandItem>
                    </motion.div>
                  ))}
                </CommandGroup>
              </>
            )}
          </AnimatePresence>
        </CommandList>
      </CommandDialog>
    )
  }

  // Render station step (after datetime confirmed)
  if (step === "station" && parsedDate) {
    return (
      <CommandDialog open={isOpen} onOpenChange={handleOpenChange} onEscapeKeyDown={handleEscapeKeyDown} className="sm:max-w-xl" shouldFilter={false}>
        <div className="flex items-center gap-2 border-b px-3 py-2 min-w-0 pr-10">
          <button
            onClick={handleBackToDatetime}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="size-4" />
          </button>
          <CalendarSearch className="size-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">
            <span className="hidden sm:inline">{formatDateTime(parsedDate)}</span>
            <span className="sm:hidden">{formatDateTimeShort(parsedDate)}</span>
          </span>
        </div>
        <CommandInput
          autoFocus
          placeholder={pickedLocation ? "Filter nearby stations..." : "Type a station name..."}
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[500px]">
          <CommandEmpty>No results found.</CommandEmpty>
          {!search.trim() && (
            <>
              <CommandGroup heading="Actions">
                <CommandItem onSelect={handlePickFromMap} className="group">
                  <MapPin className="size-4" />
                  Pick location from map
                  <EnterHint className="ml-auto" />
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          {filteredStations.length > 0 && (
            <CommandGroup heading={pickedLocation ? "Nearest Stations" : "Bicing Stations"}>
              {filteredStations.map((station, index) => (
                <motion.div
                  key={station.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut", delay: index * 0.05 }}
                >
                  <CommandItem
                    value={`station-${station.name}`}
                    onSelect={() => handleSelectStation(station)}
                    className="group"
                  >
                    <Bike className="size-4" />
                    <div className="flex flex-col flex-1">
                      <span>{station.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {getStationRegionLabel(station)}
                      </span>
                    </div>
                    {"distance" in station && (
                      <span className="text-muted-foreground text-xs">
                        {formatDistance(station.distance)}
                      </span>
                    )}
                    <EnterHint />
                  </CommandItem>
                </motion.div>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    )
  }

  // Fallback (shouldn't reach here in normal flow)
  return null
}
