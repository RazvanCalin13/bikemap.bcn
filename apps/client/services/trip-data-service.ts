import {
  getRidesStartingIn as getRidesInWindow,
  getTripsForChunk,
} from "@/app/server/trips";
import { BATCH_SIZE_SECONDS, CHUNK_SIZE_SECONDS } from "@/lib/chunk-config";
import { TripProcessorClient } from "@/lib/trip-processor-client";
import type { DeckTrip, RawTrip, ServerTrip } from "@/lib/trip-types";

export interface TripDataServiceConfig {
  windowStartMs: number;
  animationStartDate: Date;
  fadeDurationSimSeconds: number;
}

/**
 * Service that manages trip data fetching and worker processing.
 *
 * Lifecycle: new TripDataService(config) → init() → use → terminate()
 * Stateless after init - if config changes, create a new instance.
 */
export class TripDataService {
  private client: TripProcessorClient;
  private readonly config: TripDataServiceConfig;

  constructor(config: TripDataServiceConfig) {
    this.config = config;
    this.client = new TripProcessorClient({
      onBatchRequest: (batchId) => this.fetchBatch(batchId),
    });
  }

  /**
   * Initialize the worker and load initial data.
   * Must be called before using other methods.
   */
  async init(): Promise<Map<string, DeckTrip>> {
    const { windowStartMs, fadeDurationSimSeconds } = this.config;

    console.log("Initializing trip data service...");

    await this.client.init({
      windowStartMs,
      fadeDurationSimSeconds,
    });

    // Load first batch
    await this.client.loadBatch(0);

    // Request initial chunks (0-2 for buffer)
    const tripMap = new Map<string, DeckTrip>();
    const initialChunks = [0, 1, 2];

    for (const chunkIndex of initialChunks) {
      const trips = await this.client.requestChunk(chunkIndex);
      for (const trip of trips) {
        tripMap.set(trip.id, trip);
      }
    }

    console.log(`Trip data service initialized: ${tripMap.size} trips loaded`);
    return tripMap;
  }

  /**
   * Request processed trips for a specific chunk index.
   */
  async requestChunk(chunkIndex: number): Promise<DeckTrip[]> {
    return this.client.requestChunk(chunkIndex);
  }

  /**
   * Prefetch a batch in the background.
   */
  prefetchBatch(batchId: number): void {
    this.client.prefetchBatch(batchId);
  }

  /**
   * Clear a batch from worker memory.
   */
  clearBatch(batchId: number): void {
    this.client.clearBatch(batchId);
  }

  /**
   * Check if a batch is loaded.
   */
  isBatchLoaded(batchId: number): boolean {
    return this.client.isBatchLoaded(batchId);
  }

  /**
   * Terminate the worker and clean up resources.
   */
  terminate(): void {
    this.client.terminate();
  }

  /**
   * Fetch trip data for a batch from the server.
   */
  private async fetchBatch(batchId: number): Promise<RawTrip[]> {
    const { windowStartMs, animationStartDate } = this.config;

    const batchStartMs = windowStartMs + batchId * BATCH_SIZE_SECONDS * 1000;
    const batchEndMs = batchStartMs + BATCH_SIZE_SECONDS * 1000;

    console.log(`Fetching batch ${batchId} from server...`);

    const data = await getRidesInWindow({
      from: new Date(batchStartMs),
      to: new Date(batchEndMs),
    });

    // For batch 0, also fetch trips already in progress at animation start
    if (batchId === 0) {
      const overlapData = await getTripsForChunk({
        chunkStart: animationStartDate,
        chunkEnd: new Date(windowStartMs + CHUNK_SIZE_SECONDS * 1000),
      });

      // Merge and dedupe by id
      const tripMap = new Map<string, ServerTrip>();
      for (const trip of overlapData.trips) {
        tripMap.set(trip.id, trip);
      }
      for (const trip of data.trips) {
        tripMap.set(trip.id, trip);
      }

      console.log(
        `Batch 0: ${data.trips.length} starting + ${overlapData.trips.length} overlap = ${tripMap.size} unique`
      );
      return this.convertToRawTrips(Array.from(tripMap.values()));
    }

    return this.convertToRawTrips(data.trips);
  }

  /**
   * Convert server trips (with Date objects) to RawTrip (with ISO strings).
   */
  private convertToRawTrips(trips: ServerTrip[]): RawTrip[] {
    return trips.map((t) => ({
      ...t,
      startedAt: t.startedAt.toISOString(),
      endedAt: t.endedAt.toISOString(),
    }));
  }
}
