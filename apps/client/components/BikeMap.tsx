"use client";

import {
  CAMERA_POLLING_INTERVAL_MS,
  COLORS,
  INITIAL_VIEW_STATE,
  REAL_MAX_FRAME_DELTA_MS,
  SIM_CHUNK_SIZE_MS,
} from "@/lib/config";
import { createThrottledSampler } from "@/lib/misc";
import { useAnimationStore } from "@/lib/stores/animation-store";
import { usePickerStore } from "@/lib/stores/location-picker-store";
import { useSearchStore } from "@/lib/stores/search-store";
import { useMapStore } from "@/lib/stores/map-store";
import { useStationsStore } from "@/lib/stores/stations-store";
import { duckdbService, type StationStatus } from "@/services/duckdb-service";
import { ESTIMATED_TOTAL_FLEET, SIM_GRAPH_WINDOW_SIZE_MS } from "@/lib/config";
import { FlyToInterpolator, MapViewState, WebMercatorViewport } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { DeckGL } from "@deck.gl/react";
import { Info, Pause, Play, Search, Shuffle } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapboxMap } from "react-map-gl/mapbox";
import { MapControlButton } from "./MapControlButton";
import { TimeDisplay } from "./TimeDisplay";
import { GlobalStatsPanel, type GlobalStatsPanelRef, type SystemStatsPoint } from "./GlobalStatsPanel";
import { NeighborhoodStats } from "./NeighborhoodStats";
import { StationDetailsPanel } from "./StationDetailsPanel";
import { StationFocusOverlay } from "./StationFocusOverlay";
import { Kbd } from "./ui/kbd";

type AnimationState = "init" | "playing";

// Elastic easing for the "mushroom springing up" effect
const elasticOut = (t: number) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const p = 0.3;
  const s = p / 4;
  return (Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1);
};

export const BikeMap = () => {
  // Animation store
  const speedup = useAnimationStore((s) => s.speedup);
  const animationStartDate = useAnimationStore((s) => s.animationStartDate);
  const simTimeMs = useAnimationStore((s) => s.simCurrentTimeMs);
  const storePlay = useAnimationStore((s) => s.play);
  const storePause = useAnimationStore((s) => s.pause);
  const isPlaying = useAnimationStore((s) => s.isPlaying);
  const advanceSimTime = useAnimationStore((s) => s.advanceSimTime);
  const setSimCurrentTimeMs = useAnimationStore((s) => s.setSimCurrentTimeMs);
  const dateSelectionKey = useAnimationStore((s) => s.dateSelectionKey);


  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [stationStatuses, setStationStatuses] = useState<StationStatus[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
  const [showHud, setShowHud] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Track container dimensions for coordinate projection
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isMounted]);

  // Map Store actions (FlyTo)
  const flyToTrigger = useMapStore((s) => s.flyToTrigger);
  const flyToTarget = useMapStore((s) => s.flyToTarget);
  const triggerFlyTo = useMapStore((s) => s.triggerFlyTo);

  useEffect(() => {
    if (flyToTrigger > 0 && flyToTarget) {
      setViewState((prev) => ({
        ...prev,
        ...flyToTarget,
        transitionDuration: 1500,
        transitionInterpolator: new FlyToInterpolator(),
      }));

      // If stationName provided, select it
      if (flyToTarget.stationName) {
        setSelectedStationName(flyToTarget.stationName);
      }
    }
  }, [flyToTrigger, flyToTarget]);

  // Actions
  const setIsLoadingTrips = useAnimationStore((s) => s.setIsLoadingTrips);
  const setLoadError = useAnimationStore((s) => s.setLoadError);

  const { stations, load: loadStations } = useStationsStore();
  const { open: openSearch } = useSearchStore();

  const handleRandom = useCallback(() => {
    if (stations.length === 0) return;
    const randomStation = stations[Math.floor(Math.random() * stations.length)];
    triggerFlyTo({
      latitude: randomStation.latitude,
      longitude: randomStation.longitude,
      zoom: 16,
      stationName: randomStation.name
    });
  }, [stations, triggerFlyTo]);


  const lastTimestampRef = useRef<number | null>(null);

  // Throttle data fetching - fetch every real second (approx every X sim minutes depending on speed)
  const lastFetchSimTimeRef = useRef<number>(0);

  // Create ID map for performance (maps alias/id -> Station)
  const stationById = useMemo(() => {
    const map = new Map<string, typeof stations[0]>();
    stations.forEach(s => {
      // Map station_id (if available) or assume aliases/name match CSV IDs
      if (s.aliases) {
        s.aliases.forEach(alias => map.set(alias, s));
      }
      // Also map name directly
      map.set(s.name, s);
    });
    return map;
  }, [stations]);

  // Global System Stats
  const [globalStats, setGlobalStats] = useState<SystemStatsPoint[]>([]);
  const [currentStats, setCurrentStats] = useState({ parked: 0, active: 0 });

  // Calculate current stats whenever statuses update
  useEffect(() => {
    if (stationStatuses.length === 0) return;

    // Sum parked bikes across all known stations
    const totalParked = stationStatuses.reduce((acc, s) => acc + s.bikes, 0);
    const active = Math.max(0, ESTIMATED_TOTAL_FLEET - totalParked);

    setCurrentStats({ parked: totalParked, active });

    // Append to graph history (debounced by sim time)
    setGlobalStats(prev => {
      const last = prev[prev.length - 1];
      // Only add point if >1 min simulation time has passed since last point to avoid too much data
      if (last && (simTimeMs - last.simTimeMs) < 60 * 1000) return prev;

      const newPoint: SystemStatsPoint = {
        simTimeMs,
        parked: totalParked,
        active
      };

      // Keep only recent window
      const windowStart = simTimeMs - SIM_GRAPH_WINDOW_SIZE_MS;
      const filtered = prev.filter(p => p.simTimeMs > windowStart);
      return [...filtered, newPoint];
    });

  }, [stationStatuses, simTimeMs]);

  // District Stats Aggregation (Restored)
  const districtStats = useMemo(() => {
    if (stationStatuses.length === 0) return [];

    const statsMap = new Map<string, { totalBikes: number; totalCapacity: number }>();

    stationStatuses.forEach(status => {
      const station = stationById.get(status.station_id.toString()) || stationById.get(status.station_id as any); // Try both
      if (station) {
        const district = station.borough || "Unknown";
        const current = statsMap.get(district) || { totalBikes: 0, totalCapacity: 0 };

        current.totalBikes += status.bikes;
        current.totalCapacity += (status.bikes + status.docks);
        statsMap.set(district, current);
      }
    });

    return Array.from(statsMap.entries()).map(([name, data]) => ({
      name,
      totalBikes: data.totalBikes,
      totalCapacity: data.totalCapacity,
      occupancyRate: data.totalCapacity > 0 ? data.totalBikes / data.totalCapacity : 0
    }));

  }, [stationStatuses, stationById]);

  // Load initial history batch for graph (lookback)
  useEffect(() => {
    const fetchHistory = async () => {
      // Ideally we ask DuckDB for aggregate history. 
      // For now, initiate empty or standard.
      // Assuming user just starts animation, we build graph as we go.
      // Or we can try to backfill if needed.
      setGlobalStats([]);
    };
    fetchHistory();
  }, [animationStartDate]);

  // Initial Data Load
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoadingTrips(true);
        setLoadError(null);

        // Parallel init
        await Promise.all([
          loadStations(),
          duckdbService.init()
        ]);

        // Initial Data Fetch
        const initialStatuses = await duckdbService.getStationStatus(animationStartDate);
        setStationStatuses(initialStatuses);

        setIsLoadingTrips(false);
      } catch (err) {
        console.error("Initialization error:", err);
        setLoadError(err instanceof Error ? err.message : "Failed to initialize map data");
        setIsLoadingTrips(false);
      }
    };
    init();
  }, [animationStartDate, loadStations, setIsLoadingTrips, setLoadError]);

  // Reveal stations one by one
  useEffect(() => {
    if (stationStatuses.length === 0) {
      setRevealedCount(0);
      return;
    }

    // If already revealed most of them, just finish
    if (revealedCount >= stationStatuses.length) return;

    const timer = setInterval(() => {
      setRevealedCount(prev => {
        // Reveal in chunks to be snappy but still animated
        // 500 stations revealed 15 at a time = ~33 steps. 
        // At 16ms interval = ~0.5s total reveal time.
        const next = prev + 15;
        if (next >= stationStatuses.length) {
          clearInterval(timer);
          return stationStatuses.length;
        }
        return next;
      });
    }, 16);

    return () => clearInterval(timer);
  }, [stationStatuses, revealedCount]);

  // Animation Loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimestampRef.current = null;
      return;
    }

    let animationFrameId: number;

    const tick = (timestamp: number) => {
      if (lastTimestampRef.current !== null) {
        const realDeltaMs = timestamp - lastTimestampRef.current;
        // Cap delta
        const safeDelta = Math.min(realDeltaMs, REAL_MAX_FRAME_DELTA_MS);
        advanceSimTime(safeDelta * speedup);

        // Fetch new status if needed (e.g. every 5 sim-minutes)
        const currentSimTime = useAnimationStore.getState().simCurrentTimeMs;
        if (Math.abs(currentSimTime - lastFetchSimTimeRef.current) > 5 * 60 * 1000) {
          lastFetchSimTimeRef.current = currentSimTime;
          // Calculate real Date
          const currentDate = new Date(animationStartDate.getTime() + currentSimTime);
          duckdbService.getStationStatus(currentDate).then(setStationStatuses).catch(console.error);
        }
      }
      lastTimestampRef.current = timestamp;
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, speedup, advanceSimTime, animationStartDate]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) storePause();
    else storePlay();
  }, [isPlaying, storePause, storePlay]);

  // Initial Play
  useEffect(() => {
    storePlay();
  }, [storePlay]);

  // Stabilize station data for Deck.gl performance and transitions
  const stationsData = useMemo(() => {
    if (stationStatuses.length === 0) return [];

    return stationStatuses.slice(0, revealedCount).map(s => {
      const station = stationById.get(s.station_id.toString());
      if (!station) return null;
      return {
        ...s,
        coordinates: [station.longitude, station.latitude] as [number, number],
        percentage: s.bikes + s.docks > 0 ? s.bikes / (s.bikes + s.docks) : 0
      };
    }).filter((d): d is NonNullable<typeof d> => d !== null);
  }, [stationStatuses, stationById, revealedCount]);

  // Layers
  const layers = useMemo(() => {
    if (stationsData.length === 0) return [];

    return [
      new ScatterplotLayer({
        id: "station-pulse",
        data: stationsData,
        pickable: true,
        opacity: 0.8,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 3,
        radiusMaxPixels: 20,
        lineWidthMinPixels: 1,
        getPosition: (d: any) => d.coordinates,
        getRadius: (d: any) => {
          const base = 30 + (d.percentage * 20);
          const pulse = 1 + Math.sin(simTimeMs / 636) * 0.08;
          return base * pulse;
        },
        getFillColor: (d: any) => {
          const p = d.percentage;
          if (p < 0.1) return COLORS.occupancy.empty as [number, number, number];
          if (p < 0.5) return COLORS.occupancy.low as [number, number, number];
          if (p < 0.8) return COLORS.occupancy.medium as [number, number, number];
          return COLORS.occupancy.high as [number, number, number];
        },
        getLineColor: [0, 0, 0],
        updateTriggers: {
          getFillColor: [stationsData], // Changed to depend on the memoized data content
          getRadius: [simTimeMs] // Pulse depends on clock, base radius follows data updates smoothly via transitions
        },
        // Enable smooth transitions for changes
        transitions: {
          getFillColor: 600,
          getRadius: 600 // Smooth growth/shrink instead of jitter
          // Note: NO 'enter' transition here to avoid the size-zero bug
        },
        onClick: (info) => {
          if (info.object) {
            const station = stationById.get(info.object.station_id.toString());
            if (station) {
              triggerFlyTo({
                latitude: station.latitude,
                longitude: station.longitude,
                zoom: 16,
                stationName: station.name
              });
            }
          } else {
            setSelectedStationName(null);
          }
        }
      })
    ];
  }, [stationsData, simTimeMs, stationById, triggerFlyTo]);

  const selectedStationData = useMemo(() => {
    if (!selectedStationName) return null;
    const info = stationById.get(selectedStationName);
    if (!info) return null;

    // Find status for this station (match by name or ID-alias)
    const status = stationStatuses.find(s => {
      const stationMatch = stationById.get(s.station_id.toString());
      return stationMatch?.name === selectedStationName;
    });

    if (!status) return null;
    return { ...status, name: info.name };
  }, [selectedStationName, stationStatuses, stationById]);

  // Calculate focus point on screen for the selected station
  const focusPoint = useMemo(() => {
    if (!selectedStationName || !dimensions.width || !dimensions.height) return null;
    const station = stationById.get(selectedStationName);
    if (!station) return null;

    const viewport = new WebMercatorViewport({
      ...viewState,
      width: dimensions.width,
      height: dimensions.height
    });

    const [x, y] = viewport.project([station.longitude, station.latitude]);
    return { x, y };
  }, [selectedStationName, stationById, viewState, dimensions]);

  const focusColor = useMemo(() => {
    if (!selectedStationData) return "#50C878";
    const p = selectedStationData.bikes / (selectedStationData.bikes + selectedStationData.docks);
    if (p < 0.1) return "#FF3232";
    if (p < 0.5) return "#FFA500";
    if (p < 0.8) return "#FFFF00";
    return "#50C878";
  }, [selectedStationData]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayPause();
          break;
        case "KeyR":
          e.preventDefault();
          handleRandom();
          break;
        case "Slash": // '/' key
          e.preventDefault();
          openSearch();
          break;
        case "Escape":
          setSelectedStationName(null);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayPause, handleRandom, openSearch]);

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return <div>Missing Token</div>;

  // Prevent SSR to avoid hydration mismatches from browser extensions (e.g. Dark Reader) modifying SVGs
  if (!isMounted) {
    return <div className="relative w-full h-full bg-slate-950" />;
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950">
      <DeckGL
        viewState={viewState}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState }) => setViewState(viewState as MapViewState)}
        onClick={(info) => {
          if (!info.object) {
            setSelectedStationName(null);
          }
        }}
      >
        <MapboxMap
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
        />
      </DeckGL>

      {/* Focus Overlay - Gradient dimming and station highlight */}
      <StationFocusOverlay point={focusPoint} color={focusColor} />

      {/* HUD Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* MapControlButton handles children, not icon prop */}
        <MapControlButton onClick={togglePlayPause} >
          <div className="flex items-center gap-2">
            {isMounted && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isMounted && isPlaying ? "Pause" : "Play"}</span>
          </div>
          <Kbd>Space</Kbd>
        </MapControlButton>
        <MapControlButton onClick={openSearch} >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span>Search</span>
          </div>
          <Kbd>/</Kbd>
        </MapControlButton>
        <MapControlButton onClick={handleRandom} >
          <div className="flex items-center gap-2">
            <Shuffle className="w-4 h-4" />
            <span>Random</span>
          </div>
          <Kbd>R</Kbd>
        </MapControlButton>

        <div className="mt-6 pointer-events-auto hidden md:block w-[200px]">
          <NeighborhoodStats stats={districtStats} />
        </div>
      </div>

      {/* Clock - Top Center (Desktop), Top Right (Mobile) */}
      <div className="absolute top-4 z-10 right-4 md:left-1/2 md:-translate-x-1/2 md:right-auto flex flex-col w-[200px] md:w-auto items-stretch md:items-center gap-2">
        <TimeDisplay simTimeMs={simTimeMs} realWindowStartDate={animationStartDate} />
        <div className="pointer-events-auto md:hidden">
          <NeighborhoodStats stats={districtStats} />
        </div>
      </div>



      {/* Global Stats - Top Right */}
      <div className="absolute top-4 right-4 z-10 hidden md:block">
        <GlobalStatsPanel
          graphData={globalStats}
          simTimeMs={simTimeMs}
          bearing={viewState.bearing || 0}
          currentStats={currentStats}
        />
      </div>

      {selectedStationData && (
        <StationDetailsPanel
          station={selectedStationData}
          position={focusPoint}
          onClose={() => setSelectedStationName(null)}
        />
      )}

      {/* Legend / Info */}
      <div className="absolute bottom-8 right-4 z-10 bg-black/80 p-4 rounded text-white text-xs hidden md:block">
        <div className="font-bold mb-2">Station Occupancy</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#50C878] rounded-full"></div> High (&gt;80%)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#FFFF00] rounded-full"></div> Medium</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#FFA500] rounded-full"></div> Low</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#FF3232] rounded-full"></div> Empty (&lt;10%)</div>
      </div>
    </div>
  );
};
