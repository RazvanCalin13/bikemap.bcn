// Rebuild trigger
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
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
}

export interface StationStatus {
  station_id: number;
  bikes: number;
  docks: number;
  is_charging: boolean;
  status: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_HISTORICAL_DATA_URL || "/occupancy"; // Support R2 or local public folder

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

  private lastFetchTime = 0;
  private readonly REFETCH_INTERVAL_MS = 30 * 1000; // Poll every 30 seconds

  /**
   * Register a data file (CSV or JSON) based on the requested date.
   */
  private async registerDataFile(date: Date): Promise<{ filename: string, isCSV: boolean }> {
    const { db } = this.ensureInitialized();

    const year = date.getFullYear();
    const month = date.getMonth();
    const monthNum = (month + 1).toString().padStart(2, '0');
    const monthName = MONTH_NAMES[month];

    // Check if we have a historical CSV for this month
    // Format: 2025_01_Gener_BicingNou_ESTACIONS.csv
    const csvFilename = `${year}_${monthNum}_${monthName}_BicingNou_ESTACIONS.csv`;
    const csvUrl = `${BASE_URL}/${csvFilename}`;

    // We only have 2025-01 and 2025-12 in the folder based on file listing, 
    // but we should generalize.
    const isHistorical = (year === 2025 && (month === 0 || month === 11));

    if (isHistorical) {
      if (this.registeredFiles.has(csvFilename)) return { filename: csvFilename, isCSV: true };

      if (!this.missingFiles.has(csvFilename)) {
        console.log(`[DuckDB] Fetching historical CSV: ${csvUrl}...`);
        try {
          const response = await fetch(csvUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            await db.registerFileBuffer(csvFilename, new Uint8Array(arrayBuffer));
            this.registeredFiles.add(csvFilename);
            console.log(`[DuckDB] Registered ${csvFilename} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            return { filename: csvFilename, isCSV: true };
          } else {
            console.warn(`[DuckDB] Historical file ${csvFilename} not found, falling back to real-time.`);
            this.missingFiles.add(csvFilename);
          }
        } catch (err) {
          console.warn(`[DuckDB] Failed to load ${csvFilename}, falling back.`, err);
          this.missingFiles.add(csvFilename);
        }
      }
    }

    // Default to real-time JSON
    const jsonFilename = "recurs.json";
    const now = Date.now();

    // Check if we have a recent local copy
    if (this.registeredFiles.has(jsonFilename) && (now - this.lastFetchTime < this.REFETCH_INTERVAL_MS)) {
      return { filename: jsonFilename, isCSV: false };
    }

    // Check if a fetch is already in progress
    if (this.currentFetchPromise) {
      // console.log("[DuckDB] Waiting for existing fetch...");
      try {
        await this.currentFetchPromise;
        return { filename: jsonFilename, isCSV: false };
      } catch (err) {
        // If the in-flight fetch failed, we might want to retry, but for now let's fall through
      }
    }

    const url = process.env.NEXT_PUBLIC_DATA_URL || "/api/proxy";
    // console.log(`[DuckDB] Fetching real-time snapshot: ${url}...`);

    this.currentFetchPromise = (async () => {
      try {
        console.log(`[DuckDB] Fetching real-time snapshot: ${url} (t=${now})...`);
        const response = await fetch(`${url}?t=${now}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const { db } = this.ensureInitialized();
        await db.registerFileBuffer(jsonFilename, new Uint8Array(arrayBuffer));
        this.registeredFiles.add(jsonFilename);
        this.lastFetchTime = Date.now();
      } finally {
        this.currentFetchPromise = null;
      }
    })();

    try {
      await this.currentFetchPromise;
      return { filename: jsonFilename, isCSV: false };
    } catch (err) {
      if (this.registeredFiles.has(jsonFilename)) {
        console.warn("[DuckDB] Fetch failed, using stale data.", err);
        return { filename: jsonFilename, isCSV: false };
      }
      throw err;
    }
  }

  private currentFetchPromise: Promise<void> | null = null;

  /**
   * Get occupancy status for all stations at a specific time point.
   * efficiently finds the last known status before `datetime`.
   */
  async getStationStatus(datetime: Date): Promise<StationStatus[]> {
    // Ensure initialized (wait for it if currently loading)
    await this.init();
    const { conn } = this.ensureInitialized();
    const { filename, isCSV } = await this.registerDataFile(datetime);

    // Timestamp in CSV is unix seconds (based on sample: 1735685985)
    const targetTs = Math.floor(datetime.getTime() / 1000);
    const startTime = Date.now();

    const query = isCSV ? `
      WITH stations AS (
        SELECT 
          station_id::INTEGER as station_id,
          num_bikes_available::INTEGER as bikes,
          num_docks_available::INTEGER as docks,
          is_charging_station::BOOLEAN as is_charging,
          status::VARCHAR as status,
          last_reported::BIGINT as last_reported
        FROM read_csv_auto('${filename}', ALL_VARCHAR=true, nullstr='NA', ignore_errors=true)
      )
      SELECT 
        station_id,
        arg_max(bikes, last_reported) as bikes,
        arg_max(docks, last_reported) as docks,
        arg_max(is_charging, last_reported) as is_charging,
        arg_max(status, last_reported) as status
      FROM stations
      WHERE station_id IS NOT NULL 
        AND last_reported <= ${targetTs}
      GROUP BY station_id
    ` : `
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
      GROUP BY station_id
    `;

    const result = await conn.query(query);
    let rows = result.toArray();

    // Fallback if no data for this simulation time (e.g. before data starts or gap in real-time data)
    if (rows.length === 0) {
      console.log(`[DuckDB] No data for ${datetime.toISOString()} in ${filename}. Falling back to absolute latest in file.`);
      const fallbackQuery = isCSV ? `
        SELECT 
          station_id::INTEGER as station_id, 
          arg_max(num_bikes_available::INTEGER, last_reported::BIGINT) as bikes, 
          arg_max(num_docks_available::INTEGER, last_reported::BIGINT) as docks, 
          arg_max(is_charging_station::BOOLEAN, last_reported::BIGINT) as is_charging, 
          arg_max(status, last_reported::BIGINT) as status 
        FROM read_csv_auto('${filename}', ALL_VARCHAR=true, nullstr='NA', ignore_errors=true) 
        GROUP BY station_id
      ` : `
        SELECT 
          s.station_id::INTEGER as station_id,
          arg_max(s.num_bikes_available::INTEGER, s.last_reported::BIGINT) as bikes,
          arg_max(s.num_docks_available::INTEGER, s.last_reported::BIGINT) as docks,
          arg_max(s.is_charging_station::BOOLEAN, s.last_reported::BIGINT) as is_charging,
          arg_max(s.status::VARCHAR, s.last_reported::BIGINT) as status
        FROM (SELECT unnest(data.stations) as s FROM read_json_auto('${filename}', ignore_errors=true))
        GROUP BY station_id
      `;
      const fallbackResult = await conn.query(fallbackQuery);
      rows = fallbackResult.toArray();
    }
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
    const { filename, isCSV } = await this.registerDataFile(datetime);

    const targetTs = Math.floor(datetime.getTime() / 1000);

    const query = isCSV ? `
      WITH latest_status AS (
        SELECT
          arg_max(num_bikes_available::INTEGER, last_reported::BIGINT) as bikes,
          arg_max(num_docks_available::INTEGER, last_reported::BIGINT) as docks
        FROM read_csv_auto('${filename}', ALL_VARCHAR=true)
        WHERE station_id IS NOT NULL AND last_reported::BIGINT <= ${targetTs}
        GROUP BY station_id
      )
      SELECT sum(bikes) as parked, sum(docks) as docks FROM latest_status
    ` : `
      WITH raw_data AS (
        SELECT unnest(data.stations) as s
        FROM read_json_auto('${filename}', ignore_errors=true)
      ),
      latest_status AS (
        SELECT
          arg_max(s.num_bikes_available::INTEGER, s.last_reported::BIGINT) as bikes,
          arg_max(s.num_docks_available::INTEGER, s.last_reported::BIGINT) as docks
        FROM raw_data
        WHERE s.station_id IS NOT NULL
        GROUP BY s.station_id
      )
      SELECT sum(bikes) as parked, sum(docks) as docks FROM latest_status
    `;

    const result = await conn.query(query);
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
