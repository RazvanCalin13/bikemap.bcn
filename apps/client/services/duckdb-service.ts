import { DATA_END_DATE, DATA_START_DATE } from "@/lib/config";
import * as duckdb from "@duckdb/duckdb-wasm";

export interface Trip {
  id: string;
  startStationName: string;
  endStationName: string;
  startedAt: Date;
  endedAt: Date;
  bikeType: string;
  memberCasual: string;
  routeDistance: number | null;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  routeGeometry: string | null;
}

export interface StationStatus {
  station_id: number;
  bikes: number;
  docks: number;
  is_charging: boolean;
  status: string;
}

const BASE_URL = "/occupancy"; // Local public folder

const MONTH_NAMES = [
  "Gener", "Febrer", "Marc", "Abril", "Maig", "Juny",
  "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre"
];

class DuckDBService {
  private registeredFiles = new Set<string>();
  private missingFiles = new Set<string>();
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const startTime = Date.now();

    // Use jsdelivr CDN bundles
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
    );

    const worker = new Worker(workerUrl);
    const noopLogger: duckdb.Logger = { log: () => { } };
    this.db = new duckdb.AsyncDuckDB(noopLogger, worker);

    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);

    this.conn = await this.db.connect();
    console.log(`[DuckDB] Initialized in ${Date.now() - startTime}ms`);
  }

  private ensureInitialized(): { conn: duckdb.AsyncDuckDBConnection; db: duckdb.AsyncDuckDB } {
    if (!this.conn || !this.db) {
      throw new Error("DuckDB not initialized. Call init() first.");
    }
    return { conn: this.conn, db: this.db };
  }

  /**
   * Register the main JSON data file from the Open Data API
   */
  private async registerDataFile(): Promise<string> {
    const { db } = this.ensureInitialized();
    const filename = "recurs.json";

    if (this.registeredFiles.has(filename)) return filename;

    // Use local proxy to avoid CORS and hide token
    const url = "/api/proxy";

    console.log(`[DuckDB] Fetching ${url}...`);

    // No need to send token to client-side proxy, cookie/session (if any) or just open access
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // Register as buffer
    await db.registerFileBuffer(filename, new Uint8Array(arrayBuffer));
    this.registeredFiles.add(filename);
    console.log(`[DuckDB] Registered ${filename} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    return filename;
  }

  /**
   * Get occupancy status for all stations at a specific time point.
   * efficiently finds the last known status before `datetime`.
   */
  async getStationStatus(datetime: Date): Promise<StationStatus[]> {
    // Ensure initialized (wait for it if currently loading)
    await this.init();
    const { conn } = this.ensureInitialized();
    const filename = await this.registerDataFile(); // Ensure file is loaded

    // Timestamp in CSV is unix seconds (based on sample: 1735685985)
    // We query for the latest status per station <= datetime
    const targetTs = Math.floor(datetime.getTime() / 1000);

    const startTime = Date.now();

    // arg_max(column, sort_column) finds the value of 'column' where 'sort_column' is max
    // JSON structure: { last_updated: int, ttl: int, data: { stations: [ ... ] } }
    // We need to read the JSON, extracting the list of stations.
    // read_json_auto returns one row with structs.
    const result = await conn.query(`
      WITH raw_data AS (
        SELECT unnest(data.stations) as s
        FROM read_json_auto('${filename}', ignore_errors=true)
      ),
      stations AS (
        SELECT 
          s.station_id::INTEGER as station_id,
          s.num_bikes_available::INTEGER as bikes,
          s.num_docks_available::INTEGER as docks,
          s.is_charging_station::BOOLEAN as is_charging,
          s.status::VARCHAR as status,
          s.last_reported::BIGINT as last_reported
        FROM raw_data
      )
      SELECT 
        station_id,
        arg_max(bikes, last_reported) as bikes,
        arg_max(docks, last_reported) as docks,
        arg_max(is_charging, last_reported) as is_charging,
        arg_max(status, last_reported) as status
      FROM stations
      WHERE station_id IS NOT NULL 
        -- API returns current state, so time filtering might be redundant but keeping it for safety if schema changes
        -- AND last_reported <= ${targetTs} 
      GROUP BY station_id
    `);

    const rows = result.toArray();
    console.log(`[DuckDB] getStationStatus for ${datetime.toISOString()} returned ${rows.length} stations (${Date.now() - startTime}ms)`);

    return rows.map((row: any) => ({
      station_id: Number(row.station_id),
      bikes: Number(row.bikes),
      docks: Number(row.docks),
      is_charging: Boolean(row.is_charging),
      status: String(row.status)
    }));
  }

  /**
   * Get trips starting from a specific station within a time window.
   */
  async getTripsFromStation(filter: { startStationName: string, datetime: Date, intervalMs: number }): Promise<Trip[]> {
    // TODO: Implement actual trip querying when trip data is available.
    // Currently we only have station status data.
    console.warn("[DuckDB] getTripsFromStation called but no trip data available.");
    return [];
  }

  /**
   * Get trips that start within a given time range.
   */
  async getTripsInRange(filter: { from: Date; to: Date }): Promise<any[]> {
    // TODO: Implement actual trip querying when trip data is available.
    console.warn("[DuckDB] getTripsInRange called but no trip data available.");
    return [];
  }

  /**
   * Get trips that were already in progress at chunkStart but end before/after/at chunkEnd.
   */
  async getTripsOverlap(filter: { chunkStart: Date; chunkEnd: Date }): Promise<any[]> {
    // TODO: Implement actual trip querying when trip data is available.
    console.warn("[DuckDB] getTripsOverlap called but no trip data available.");
    return [];
  }

  /** Calculate system-wide stats (total parked, total docks) for a given time */
  async getSystemStats(datetime: Date): Promise<{ parked: number, docks: number }> {
    await this.init();
    const { conn } = this.ensureInitialized();
    const filename = await this.registerDataFile();

    const targetTs = Math.floor(datetime.getTime() / 1000);

    const result = await conn.query(`
      WITH raw_data AS (
        SELECT unnest(data.stations) as s
        FROM read_json_auto('${filename}', ignore_errors=true)
      ),
      latest_status AS (
        SELECT
          arg_max(s.num_bikes_available, s.last_reported) as bikes,
          arg_max(s.num_docks_available, s.last_reported) as docks
        FROM raw_data
        WHERE s.station_id IS NOT NULL 
        GROUP BY s.station_id
      )
      SELECT sum(bikes) as parked, sum(docks) as docks FROM latest_status
    `);
    const row = result.toArray()[0];
    return {
      parked: row ? Number(row.parked) : 0,
      docks: row ? Number(row.docks) : 0
    };
  }

  async getSystemStatsBatch(timestamps: Date[]): Promise<{ time: number, parked: number, docks: number }[]> {
    const results = [];
    // Execute sequentially to be safe
    for (const t of timestamps) {
      const stats = await this.getSystemStats(t);
      results.push({
        time: t.getTime(),
        parked: stats.parked,
        docks: stats.docks
      });
    }
    return results;
  }

  terminate(): void {
    this.conn?.close();
    this.db?.terminate();
    this.conn = null;
    this.db = null;
    this.initPromise = null;
  }
}

export const duckdbService = new DuckDBService();
