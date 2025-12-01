import { Database } from 'bun:sqlite';
import path from 'path';
import { z } from 'zod';

const OSRM_URL = 'http://localhost:5000';
const CONCURRENCY = 100;
const BATCH_SIZE = 100_000;

// Station pair from DB query
const StationPairSchema = z.object({
  startStationId: z.string(),
  endStationId: z.string(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  tripCount: z.number(),
});
type StationPair = z.infer<typeof StationPairSchema>;

// OSRM route from response
const RouteSchema = z.object({
  geometry: z.string(),
  distance: z.number(),
  duration: z.number(),
  legs: z.array(
    z.object({
      steps: z.array(z.unknown()),
      weight: z.number(),
      summary: z.string(),
      duration: z.number(),
      distance: z.number(),
    })
  ),
  weight: z.number(),
  weight_name: z.string(),
});

// OSRM success response
const OSRMSuccessResponseSchema = z.object({
  code: z.literal('Ok'),
  routes: z.array(RouteSchema).min(1),
  waypoints: z.array(z.unknown()),
});

// OSRM error response
const OSRMErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
});

const OSRMResponseSchema = z.union([OSRMSuccessResponseSchema, OSRMErrorResponseSchema]);
type OSRMResponse = z.infer<typeof OSRMResponseSchema>;
type OSRMSuccessResponse = z.infer<typeof OSRMSuccessResponseSchema>;

function isSuccessResponse(response: OSRMResponse): response is OSRMSuccessResponse {
  return response.code === 'Ok';
}

// What we store per route
const RouteDataSchema = z.object({
  geometry: z.string(),
  distance: z.number(),
  duration: z.number(),
});
type RouteData = z.infer<typeof RouteDataSchema>;

async function fetchRoute(data: {
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
}): Promise<RouteData | null> {
  const url = `${OSRM_URL}/route/v1/bicycle/${data.startLng},${data.startLat};${data.endLng},${data.endLat}?geometries=polyline6&overview=full`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    const parsed = OSRMResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error('Invalid OSRM response:', parsed.error.message);
      return null;
    }

    if (!isSuccessResponse(parsed.data)) {
      return null;
    }

    const route = parsed.data.routes[0]!; // min(1) guarantees at least one
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
    };

  } catch (error) {
    console.error('Route fetch error:', error);
    return null;
  }
}

async function main(): Promise<void> {
  const dbPath = path.join(import.meta.dir, '../db/mydb.db');
  const db = new Database(dbPath, { readonly: true });

  const outputPath = path.join(import.meta.dir, '../db/routes.json');

  // Check for existing progress
  let routeCache: Record<string, RouteData> = {};
  let processedPairs = new Set<string>();

  try {
    const existing = await Bun.file(outputPath).json();
    routeCache = existing;
    processedPairs = new Set(Object.keys(existing));
    console.log(`Resuming: ${processedPairs.size} routes already cached`);
  } catch {
    console.log('Starting fresh route cache');
  }

  // Get unique station pairs with coordinates, ordered by trip count (most popular first)
  console.log('Fetching unique station pairs...');
  const pairs = db
    .query<StationPair, []>(
      `
    SELECT
      t.startStationId,
      t.endStationId,
      s1.latitude as startLat,
      s1.longitude as startLng,
      s2.latitude as endLat,
      s2.longitude as endLng,
      COUNT(*) as tripCount
    FROM Trip t
    JOIN Station s1 ON t.startStationId = s1.id
    JOIN Station s2 ON t.endStationId = s2.id
    GROUP BY t.startStationId, t.endStationId
    ORDER BY tripCount DESC
  `
    )
    .all();

  console.log(`Found ${pairs.length} unique station pairs`);

  // Filter out already processed pairs
  const remainingPairs = pairs.filter((p) => {
    const key = `${p.startStationId}|${p.endStationId}`;
    return !processedPairs.has(key);
  });

  console.log(`${remainingPairs.length} pairs remaining to process`);

  if (remainingPairs.length === 0) {
    console.log('All routes already cached!');
    db.close();
    return;
  }

  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < remainingPairs.length; i += CONCURRENCY) {
    const batch = remainingPairs.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (pair) => {
        const routeData = await fetchRoute({
          startLng: pair.startLng,
          startLat: pair.startLat,
          endLng: pair.endLng,
          endLat: pair.endLat,
        });
        return { pair, routeData };
      })
    );

    for (const { pair, routeData } of results) {
      const key = `${pair.startStationId}|${pair.endStationId}`;
      if (routeData) {
        routeCache[key] = routeData;
        processed++;
      } else {
        failed++;
      }
    }

    // Progress update
    const total = processed + failed;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = total / elapsed;
    const remaining = remainingPairs.length - total;
    const eta = remaining / rate;

    process.stdout.write(
      `\r[${total}/${remainingPairs.length}] ${processed} success, ${failed} failed | ${rate.toFixed(0)}/s | ETA: ${(eta / 60).toFixed(1)}min`
    );

    // Save progress periodically
    if (total % BATCH_SIZE === 0) {
      await Bun.write(outputPath, JSON.stringify(routeCache));
    }
  }

  // Final save
  await Bun.write(outputPath, JSON.stringify(routeCache));

  console.log('\n');
  console.log('='.repeat(50));
  console.log(`Routes cached: ${processed}`);
  console.log(`Routes failed: ${failed}`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
  console.log(`Output: ${outputPath}`);
  console.log('='.repeat(50));

  db.close();
}

main();
