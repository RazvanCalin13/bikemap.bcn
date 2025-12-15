import { DuckDBConnection } from "@duckdb/node-api";
import fs from "fs";
import path from "path";

/**
 * Derive station search data from trips Parquet.
 *
 * Input:
 * - `output/trips/*.parquet` (relative to this package cwd)
 *   Requires trips parquet to include:
 *   - startStationId, startStationName, startLat, startLng
 *   - endStationId, endStationName, endLat, endLng
 *
 * Output:
 * - `output/stations.json` with shape:
 *   Array<{ name: string; ids: string[]; latitude: number; longitude: number }>
 *
 * Notes:
 * - We intentionally merge stations by NAME for search UX.
 * - This is a derived artifact; regenerate whenever trips parquet changes.
 */

type StationForSearch = {
  name: string;
  ids: string[];
  latitude: number;
  longitude: number;
};

function printStationAveragingDiagnostics(
  coordVariance: Array<{
    id: string;
    name: string;
    point_count: bigint;
    distinct_coords_6dp: bigint;
    coord1_lat: number;
    coord1_lng: number;
    coord2_lat: number;
    coord2_lng: number;
  }>
): void {
  if (coordVariance.length === 0) return;

  console.warn(
    "\nStations being averaged across multiple coordinates (top 20; showing 2 coords):"
  );
  for (const row of coordVariance) {
    console.warn(
      `- id="${row.id}" name="${row.name}" points=${row.point_count} distinct_coords@6dp=${row.distinct_coords_6dp} coords=(${row.coord1_lat.toFixed(
        6
      )}, ${row.coord1_lng.toFixed(6)}) vs (${row.coord2_lat.toFixed(6)}, ${row.coord2_lng.toFixed(
        6
      )})`
    );
  }
}

async function main() {
  const outputDir = path.join(process.cwd(), "output");
  const tripsGlob = path.join(outputDir, "trips/*.parquet");
  const stationsPath = path.join(outputDir, "stations.json");

  console.log("Building stations.json from trips parquet...");
  console.log(`Trips glob: ${tripsGlob}`);
  console.log(`Output: ${stationsPath}`);

  const connection = await DuckDBConnection.create();

  // Diagnostics: show station IDs whose coordinates vary (these get averaged downstream).
  const stationCoordVarianceReader = await connection.runAndReadAll(`
    WITH station_points AS (
      SELECT
        startStationId AS id,
        startStationName AS name,
        startLat AS lat,
        startLng AS lng
      FROM read_parquet('${tripsGlob}')
      UNION ALL
      SELECT
        endStationId AS id,
        endStationName AS name,
        endLat AS lat,
        endLng AS lng
      FROM read_parquet('${tripsGlob}')
    ),
    station_name AS (
      -- Pick the most frequently observed name for each station id
      SELECT id, name
      FROM (
        SELECT
          id,
          name,
          COUNT(*) AS cnt,
          ROW_NUMBER() OVER (PARTITION BY id ORDER BY COUNT(*) DESC, name) AS rn
        FROM station_points
        WHERE id IS NOT NULL AND name IS NOT NULL
        GROUP BY id, name
      )
      WHERE rn = 1
    ),
    coord_counts AS (
      SELECT
        id,
        ROUND(lat, 6) AS lat6,
        ROUND(lng, 6) AS lng6,
        COUNT(*) AS cnt
      FROM station_points
      WHERE id IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
      GROUP BY id, lat6, lng6
    ),
    ranked AS (
      SELECT
        id,
        lat6,
        lng6,
        cnt,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY cnt DESC, lat6, lng6) AS rn,
        SUM(cnt) OVER (PARTITION BY id) AS point_count,
        COUNT(*) OVER (PARTITION BY id) AS distinct_coords_6dp
      FROM coord_counts
    )
    SELECT
      id,
      COALESCE(MAX(station_name.name), '') AS name,
      MAX(point_count) AS point_count,
      MAX(distinct_coords_6dp) AS distinct_coords_6dp,
      MAX(CASE WHEN rn = 1 THEN lat6 END) AS coord1_lat,
      MAX(CASE WHEN rn = 1 THEN lng6 END) AS coord1_lng,
      MAX(CASE WHEN rn = 2 THEN lat6 END) AS coord2_lat,
      MAX(CASE WHEN rn = 2 THEN lng6 END) AS coord2_lng
    FROM ranked
    LEFT JOIN station_name USING (id)
    GROUP BY id
    HAVING MAX(distinct_coords_6dp) > 1
    ORDER BY MAX(distinct_coords_6dp) DESC, MAX(point_count) DESC
    LIMIT 20
  `);

  printStationAveragingDiagnostics(
    stationCoordVarianceReader.getRowObjectsJson() as unknown as Array<{
      id: string;
      name: string;
      point_count: bigint;
      distinct_coords_6dp: bigint;
      coord1_lat: number;
      coord1_lng: number;
      coord2_lat: number;
      coord2_lng: number;
    }>
  );

  const stationsReader = await connection.runAndReadAll(`
    WITH station_points AS (
      SELECT
        startStationId AS id,
        startStationName AS name,
        startLat AS lat,
        startLng AS lng
      FROM read_parquet('${tripsGlob}')
      UNION ALL
      SELECT
        endStationId AS id,
        endStationName AS name,
        endLat AS lat,
        endLng AS lng
      FROM read_parquet('${tripsGlob}')
    )
    SELECT
      name,
      STRING_AGG(DISTINCT id, ',') AS ids_csv,
      AVG(lat) AS latitude,
      AVG(lng) AS longitude
    FROM station_points
    WHERE name IS NOT NULL
      AND id IS NOT NULL
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    GROUP BY name
    ORDER BY name
  `);

  const rows = stationsReader.getRowObjectsJson() as unknown as Array<{
    name: string;
    ids_csv: string;
    latitude: number;
    longitude: number;
  }>;

  const stations: StationForSearch[] = rows.map((r) => ({
    name: r.name,
    ids: r.ids_csv.split(",").filter(Boolean),
    latitude: r.latitude,
    longitude: r.longitude,
  }));

  fs.writeFileSync(stationsPath, JSON.stringify(stations, null, 2));
  console.log(`Wrote ${stations.length} stations to ${stationsPath}`);

  connection.closeSync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
