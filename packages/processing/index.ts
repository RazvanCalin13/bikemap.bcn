import { type Station, type Trip, prisma } from '@bikemap/db';
import { parse } from 'csv-parse';
import { glob } from 'glob';
import path from 'path';
import { z } from 'zod';

const BATCH_SIZE = 5000;

const CSVRowSchema = z.object({
  ride_id: z.string().min(1),
  rideable_type: z.string().min(1),
  started_at: z.coerce.date(),
  ended_at: z.coerce.date(),
  start_station_name: z.string().min(1),
  start_station_id: z.string().min(1),
  end_station_name: z.string().min(1),
  end_station_id: z.string().min(1),
  start_lat: z.coerce.number(),
  start_lng: z.coerce.number(),
  end_lat: z.coerce.number(),
  end_lng: z.coerce.number(),
  member_casual: z.enum(["member", "casual"]), 
});

type CSVRow = z.infer<typeof CSVRowSchema>;

function validateRow(data: { row: unknown; rowIndex: number; fileName: string }): CSVRow {
  const result = CSVRowSchema.safeParse(data.row);
  if (!result.success) {
    const errors = result.error.issues.map((e) => e.message).join(', ');
    throw new Error(`Validation failed in ${data.fileName} at row ${data.rowIndex + 2}: ${errors}\nRow data: ${JSON.stringify(data.row)}`);
  }
  return result.data;
}

async function updateStationMapWithRows(stationMap: Map<string, Station>, rows: CSVRow[]): Promise<Map<string, Station>> {
  for (const row of rows) {
    if (!stationMap.has(row.start_station_id)) {
      stationMap.set(row.start_station_id, {
        id: row.start_station_id,
        name: row.start_station_name,
        latitude: row.start_lat,
        longitude: row.start_lng,
      });
    }

    if (!stationMap.has(row.end_station_id)) {
      stationMap.set(row.end_station_id, {
        id: row.end_station_id,
        name: row.end_station_name,
        latitude: row.end_lat,
        longitude: row.end_lng,
      });
    }
  }

  return stationMap;
}

function mapRowToTrip(row: CSVRow): Trip {
  return {
    id: row.ride_id,
    startStationId: row.start_station_id,
    endStationId: row.end_station_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    rideableType: row.rideable_type,
    memberCasual: row.member_casual,
    startLat: row.start_lat,
    startLng: row.start_lng,
    endLat: row.end_lat,
    endLng: row.end_lng,
  };
}



async function insertTripsInBatches(trips: Trip[]) {
  for (let i = 0; i < trips.length; i += BATCH_SIZE) {
    const batch = trips.slice(i, i + BATCH_SIZE);
    await prisma.trip.createMany({ data: batch });
  }
}

async function main() {
  const dataDir = path.join(process.cwd(), '../../data');
  let csvFiles = glob.sync('**/*.csv', { cwd: dataDir, absolute: true });

  console.log(`Found ${csvFiles.length} CSV files\n`);

  const stationMap = new Map<string, Station>();
  let totalTrips = 0;
  let skippedRows = 0;

  for (const csvFile of csvFiles) {
    const fileName = path.basename(csvFile);
    console.log(`Processing ${fileName}...`);

    const file = Bun.file(csvFile);
    const fileString = await file.text();
    const parser = parse(fileString, { columns: true });

    const validRows: CSVRow[] = [];

    let rowIndex = 0;
    for await (const record of parser) {
      try {
        const row = validateRow({ row: record, rowIndex, fileName });
        validRows.push(row);
      } catch (err) {
        skippedRows++;
      }
      rowIndex++;
    }

    // Update station map
    await updateStationMapWithRows(stationMap, validRows);

    // Insert trips for this file
    const trips = validRows.map(mapRowToTrip);
    await insertTripsInBatches(trips);
    totalTrips += trips.length;

    const percentThrown = rowIndex > 0 ? ((skippedRows / rowIndex) * 100).toFixed(2) : 0;
    console.log(`  ${validRows.length} valid rows, ${skippedRows} skipped (${percentThrown}% thrown away)`);
  }

  // Insert all stations at the end
  console.log(`\nInserting ${stationMap.size} stations...`);
  await prisma.station.createMany({
    data: Array.from(stationMap.values()),
  });

  console.log(`\nDone! Inserted ${totalTrips} trips and ${stationMap.size} stations.`);
}

main()
