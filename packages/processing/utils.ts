import { type Station, type Trip } from '@bikemap/db';
import { Database } from 'bun:sqlite';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export const CSVRowSchema = z.object({
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
  member_casual: z.enum(['member', 'casual']),
});

export type CSVRow = z.infer<typeof CSVRowSchema>;

export function mapRowToTrip(row: CSVRow): Trip {
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

export function parseAndValidateCSV(fileString: string): { validRows: CSVRow[]; skippedCount: number } {
  const records = parse(fileString, { columns: true }) as unknown[];
  const validRows: CSVRow[] = [];
  let skippedCount = 0;

  for (const record of records) {
    const result = CSVRowSchema.safeParse(record);
    if (result.success) {
      validRows.push(result.data);
    } else {
      skippedCount++;
    }
  }

  return { validRows, skippedCount };
}

export function createDatabase(dbPath: string) {
  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL;');

  const insertTripStmt = db.prepare(`
    INSERT INTO Trip (id, startStationId, endStationId, startedAt, endedAt, rideableType, memberCasual, startLat, startLng, endLat, endLng)
    VALUES ($id, $startStationId, $endStationId, $startedAt, $endedAt, $rideableType, $memberCasual, $startLat, $startLng, $endLat, $endLng)
  `);

  const insertStationStmt = db.prepare(`
    INSERT OR IGNORE INTO Station (id, name, latitude, longitude)
    VALUES ($id, $name, $latitude, $longitude)
  `);

  const insertTrips = db.transaction((trips: Trip[]) => {
    for (const trip of trips) {
      insertTripStmt.run({
        $id: trip.id,
        $startStationId: trip.startStationId,
        $endStationId: trip.endStationId,
        $startedAt: trip.startedAt.toISOString(),
        $endedAt: trip.endedAt.toISOString(),
        $rideableType: trip.rideableType,
        $memberCasual: trip.memberCasual,
        $startLat: trip.startLat,
        $startLng: trip.startLng,
        $endLat: trip.endLat,
        $endLng: trip.endLng,
      });
    }
  });

  const insertStations = db.transaction((stations: Station[]) => {
    for (const station of stations) {
      insertStationStmt.run({
        $id: station.id,
        $name: station.name,
        $latitude: station.latitude,
        $longitude: station.longitude,
      });
    }
  });

  return { db, insertTrips, insertStations };
}
