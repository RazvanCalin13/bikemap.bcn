import { DuckDBConnection } from "@duckdb/node-api";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import fs from "fs";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import path from "path";
import { dataDir, gitRoot } from "./utils";

// Derive station data from raw CSV files + geocode with neighborhood boundaries.
// Clusters stations from ALL years by coordinates to create a unified station list
// with aliases for historical name lookups.
//
// Input:
// - data/**/*.csv (raw Citi Bike trip CSVs from all years)
// - data/d085e2f8d0b54d4590b1e7d1f35594c1pediacitiesnycneighborhoods.geojson
//
// Output:
// - apps/client/public/stations.json

// Glob for ALL years (legacy uses spaces in columns, modern uses underscores)
const allYearsCsvGlob = path.join(dataDir, "**/*.csv");

// Distance threshold for clustering stations at same physical location
const CLUSTER_THRESHOLD_METERS = 60;

// NYC bounding box (same as build-parquet.ts) - filters out invalid/test stations
const NYC_BOUNDS = {
  minLat: 40.3,
  maxLat: 41.2,
  minLng: -74.5,
  maxLng: -73.5,
};

type NeighborhoodProperties = {
  neighborhood: string;
  borough: string;
};

type NeighborhoodFeature = Feature<Polygon, NeighborhoodProperties>;

type StationRegion = {
  borough: string;
  neighborhood: string;
};

type StationForSearch = {
  name: string;
  aliases: string[]; // Historical names for search matching (excludes canonical name)
  ids: string[];
  latitude: number;
  longitude: number;
  borough: string;
  neighborhood: string;
};

// Get region for NJ stations (simple bounding box)
function getNJRegion(lat: number, lng: number): StationRegion | null {
  // West of Hudson River = NJ
  if (lng < -74.02) {
    if (lat > 40.735) {
      return { borough: "New Jersey", neighborhood: "Hoboken" };
    }
    return { borough: "New Jersey", neighborhood: "Jersey City" };
  }
  return null;
}

// Get region for NYC stations (point-in-polygon)
function getNYCRegion(
  lat: number,
  lng: number,
  neighborhoods: NeighborhoodFeature[]
): StationRegion | null {
  const stationPoint = point([lng, lat]);

  for (const feature of neighborhoods) {
    if (booleanPointInPolygon(stationPoint, feature.geometry)) {
      return {
        borough: feature.properties.borough,
        neighborhood: feature.properties.neighborhood,
      };
    }
  }
  return null;
}

// Get region for a station
function getStationRegion(
  lat: number,
  lng: number,
  neighborhoods: NeighborhoodFeature[]
): StationRegion {
  // Try NJ first (fast bounding box check)
  const njRegion = getNJRegion(lat, lng);
  if (njRegion) return njRegion;

  // Try NYC (point-in-polygon)
  const nycRegion = getNYCRegion(lat, lng, neighborhoods);
  if (nycRegion) return nycRegion;

  return { borough: "Unknown", neighborhood: "Unknown" };
}

// Raw station data from CSV extraction (before clustering)
type RawStation = {
  name: string;
  ids: string[];
  latitude: number;
  longitude: number;
  year: number; // Year this name was observed (for canonical name selection)
};

// Cluster stations by coordinates (~50m threshold = same physical location)
// Returns merged stations with aliases
function clusterStationsByCoordinates(data: {
  stations: RawStation[];
  thresholdMeters: number;
}): Array<{
  canonicalName: string;
  aliases: string[];
  ids: string[];
  latitude: number;
  longitude: number;
}> {
  const { stations, thresholdMeters } = data;
  const clusters: Array<{
    names: Map<string, number>; // name -> latest year seen
    ids: Set<string>;
    latSum: number;
    lngSum: number;
    count: number;
  }> = [];

  for (const station of stations) {
    // Find nearest cluster within threshold
    let nearestCluster: (typeof clusters)[number] | null = null;
    let nearestDist = Infinity;
    for (const cluster of clusters) {
      const clusterLat = cluster.latSum / cluster.count;
      const clusterLng = cluster.lngSum / cluster.count;
      const dist = distance(
        point([station.longitude, station.latitude]),
        point([clusterLng, clusterLat]),
        { units: "meters" }
      );
      if (dist < thresholdMeters && dist < nearestDist) {
        nearestCluster = cluster;
        nearestDist = dist;
      }
    }

    if (nearestCluster) {
      // Add to existing cluster
      const existingYear = nearestCluster.names.get(station.name);
      if (!existingYear || station.year > existingYear) {
        nearestCluster.names.set(station.name, station.year);
      }
      for (const id of station.ids) {
        nearestCluster.ids.add(id);
      }
      nearestCluster.latSum += station.latitude;
      nearestCluster.lngSum += station.longitude;
      nearestCluster.count++;
    } else {
      // Create new cluster
      const names = new Map<string, number>();
      names.set(station.name, station.year);
      clusters.push({
        names,
        ids: new Set(station.ids),
        latSum: station.latitude,
        lngSum: station.longitude,
        count: 1,
      });
    }
  }

  // Convert clusters to output format
  return clusters.map((cluster) => {
    // Pick canonical name: most recent year, then alphabetically
    const sortedNames = Array.from(cluster.names.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // Most recent year first
      return a[0].localeCompare(b[0]); // Alphabetically for ties
    });

    const canonicalName = sortedNames[0]![0];
    const aliases = sortedNames.slice(1).map(([name]) => name);

    return {
      canonicalName,
      aliases,
      ids: Array.from(cluster.ids),
      latitude: cluster.latSum / cluster.count,
      longitude: cluster.lngSum / cluster.count,
    };
  });
}

async function main() {
  const clientPublicDir = path.join(gitRoot, "apps/client/public");
  const stationsPath = path.join(clientPublicDir, "stations.json");
  const geoJsonPath = path.join(
    dataDir,
    "d085e2f8d0b54d4590b1e7d1f35594c1pediacitiesnycneighborhoods.geojson"
  );

  console.log("Building stations.json from ALL CSV files (with aliases)...");
  console.log(`CSV glob: ${allYearsCsvGlob}`);
  console.log(`GeoJSON: ${geoJsonPath}`);
  console.log(`Output: ${stationsPath}`);

  // Load neighborhood boundaries for geocoding
  console.log("\nLoading neighborhood boundaries...");
  const geoData = JSON.parse(fs.readFileSync(geoJsonPath, "utf-8")) as FeatureCollection<
    Polygon,
    NeighborhoodProperties
  >;
  const neighborhoods = geoData.features as NeighborhoodFeature[];
  console.log(`Loaded ${neighborhoods.length} neighborhood polygons`);

  const connection = await DuckDBConnection.create();

  // Extract all unique stations from ALL years
  // Handles both legacy schema (spaces in column names) and modern schema (underscores)
  // Uses union_by_name=true to merge different schemas
  console.log("\nExtracting stations from all years...");
  const stationsReader = await connection.runAndReadAll(`
    WITH all_stations AS (
      -- Modern schema (2020+): start_station_name, start_lat, etc.
      SELECT
        start_station_name AS name,
        start_station_id AS id,
        start_lat AS lat,
        start_lng AS lng,
        EXTRACT(YEAR FROM started_at) AS year
      FROM read_csv_auto('${allYearsCsvGlob}', union_by_name=true)
      WHERE start_station_name IS NOT NULL
        AND TRY_CAST(start_lat AS DOUBLE) IS NOT NULL
        AND TRY_CAST(start_lng AS DOUBLE) IS NOT NULL

      UNION ALL

      SELECT
        end_station_name AS name,
        end_station_id AS id,
        end_lat AS lat,
        end_lng AS lng,
        EXTRACT(YEAR FROM ended_at) AS year
      FROM read_csv_auto('${allYearsCsvGlob}', union_by_name=true)
      WHERE end_station_name IS NOT NULL
        AND TRY_CAST(end_lat AS DOUBLE) IS NOT NULL
        AND TRY_CAST(end_lng AS DOUBLE) IS NOT NULL

      UNION ALL

      -- Legacy schema (2013-2019): "start station name", "start station latitude", etc.
      SELECT
        "start station name" AS name,
        "start station id"::VARCHAR AS id,
        TRY_CAST("start station latitude" AS DOUBLE) AS lat,
        TRY_CAST("start station longitude" AS DOUBLE) AS lng,
        EXTRACT(YEAR FROM starttime) AS year
      FROM read_csv_auto('${allYearsCsvGlob}', union_by_name=true)
      WHERE "start station name" IS NOT NULL
        AND TRY_CAST("start station latitude" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("start station longitude" AS DOUBLE) IS NOT NULL

      UNION ALL

      SELECT
        "end station name" AS name,
        "end station id"::VARCHAR AS id,
        TRY_CAST("end station latitude" AS DOUBLE) AS lat,
        TRY_CAST("end station longitude" AS DOUBLE) AS lng,
        EXTRACT(YEAR FROM stoptime) AS year
      FROM read_csv_auto('${allYearsCsvGlob}', union_by_name=true)
      WHERE "end station name" IS NOT NULL
        AND TRY_CAST("end station latitude" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("end station longitude" AS DOUBLE) IS NOT NULL
    ),
    -- Deduplicate: for each name, get median coords and all IDs
    station_summary AS (
      SELECT
        name,
        MEDIAN(lat) AS latitude,
        MEDIAN(lng) AS longitude,
        STRING_AGG(DISTINCT id, ',') AS ids_csv,
        MAX(year) AS max_year
      FROM all_stations
      WHERE lat IS NOT NULL AND lng IS NOT NULL
      GROUP BY name
    )
    SELECT
      name,
      ids_csv,
      latitude,
      longitude,
      max_year
    FROM station_summary
    ORDER BY name
  `);

  const rawRows = stationsReader.getRowObjectsJson() as unknown as Array<{
    name: string;
    ids_csv: string | null;
    latitude: number;
    longitude: number;
    max_year: number;
  }>;

  console.log(`  Found ${rawRows.length} unique station names across all years`);

  // Filter to NYC bounding box and convert to RawStation format
  const rawStations: RawStation[] = rawRows
    .filter((r) => {
      const inBounds =
        r.latitude >= NYC_BOUNDS.minLat &&
        r.latitude <= NYC_BOUNDS.maxLat &&
        r.longitude >= NYC_BOUNDS.minLng &&
        r.longitude <= NYC_BOUNDS.maxLng;
      if (!inBounds) {
        console.log(`  Filtered out: ${r.name} (${r.latitude.toFixed(6)}, ${r.longitude.toFixed(6)}) - outside NYC bounds`);
      }
      return inBounds;
    })
    .map((r) => ({
      name: r.name,
      ids: (r.ids_csv ?? "").split(",").filter(Boolean),
      latitude: r.latitude,
      longitude: r.longitude,
      year: r.max_year,
    }));

  console.log(`  ${rawStations.length} stations within NYC bounds`);

  // Cluster by coordinates
  console.log(`\nClustering stations by coordinates (threshold: ${CLUSTER_THRESHOLD_METERS}m)...`);
  const clustered = clusterStationsByCoordinates({
    stations: rawStations,
    thresholdMeters: CLUSTER_THRESHOLD_METERS,
  });
  console.log(`  Merged into ${clustered.length} physical locations`);

  const totalAliases = clustered.reduce((sum, c) => sum + c.aliases.length, 0);
  console.log(`  Total aliases: ${totalAliases} (for search matching)`);

  // Geocode each station
  console.log("\nGeocoding stations...");
  let matched = 0;
  let unmatched = 0;

  const stations: StationForSearch[] = clustered.map((c) => {
    const region = getStationRegion(c.latitude, c.longitude, neighborhoods);
    if (region.borough === "Unknown") {
      unmatched++;
      console.warn(`  ⚠ Unmatched: ${c.canonicalName} (${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)})`);
    } else {
      matched++;
    }
    return {
      name: c.canonicalName,
      aliases: c.aliases,
      ids: c.ids,
      latitude: c.latitude,
      longitude: c.longitude,
      borough: region.borough,
      neighborhood: region.neighborhood,
    };
  });

  console.log(`Geocoded: ${matched} matched, ${unmatched} unmatched`);

  fs.writeFileSync(stationsPath, JSON.stringify(stations, null, 2));
  console.log(`\nWrote ${stations.length} stations to ${stationsPath}`);

  connection.closeSync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
