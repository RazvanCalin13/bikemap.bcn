import { parse } from 'csv-parse/sync';
import { glob } from 'glob';
import path from 'path';
import { createDatabase, CSVRowSchema, mapRowToTrip, type CSVRow } from './utils';

async function profile() {
  const dataDir = path.join(process.cwd(), '../../data');
  const csvFiles = glob.sync('**/202506-citibike-tripdata_5.csv', { cwd: dataDir, absolute: true });

  // Pick a large file (one with ~1M rows)
  const testFile = csvFiles.find((f) => f.includes('citibike-tripdata')) ?? csvFiles[0];
  if (!testFile) {
    console.error('No CSV files found');
    process.exit(1);
  }
  const fileName = path.basename(testFile);

  console.log(`Profiling: ${fileName}\n`);
  console.log('='.repeat(50));

  // 1. Read file
  const t0 = performance.now();
  const file = Bun.file(testFile);
  const fileString = await file.text();
  const tRead = performance.now();
  console.log(`1. Read file:        ${(tRead - t0).toFixed(0)}ms (${(fileString.length / 1024 / 1024).toFixed(1)}MB)`);

  // 2. Parse CSV
  const records = parse(fileString, { columns: true }) as unknown[];
  const tParse = performance.now();
  console.log(`2. Parse CSV:        ${(tParse - tRead).toFixed(0)}ms (${records.length.toLocaleString()} rows)`);

  // 3. Validate with Zod
  const validRows: CSVRow[] = [];
  let skipped = 0;
  for (const record of records) {
    const result = CSVRowSchema.safeParse(record);
    if (result.success) {
      validRows.push(result.data);
    } else {
      skipped++;
    }
  }
  const tValidate = performance.now();
  console.log(`3. Zod validation:   ${(tValidate - tParse).toFixed(0)}ms (${validRows.length.toLocaleString()} valid, ${skipped} skipped)`);

  // 4. Map to Trip objects
  const trips = validRows.map(mapRowToTrip);
  const tMap = performance.now();
  console.log(`4. Map to Trip:      ${(tMap - tValidate).toFixed(0)}ms`);

  // 5. DB insert
  const skipDb = process.argv.includes('--skip-db');
  let tDb = tMap;
  if (skipDb) {
    console.log(`5. DB insert:        SKIPPED (--skip-db flag)`);
  } else {
    const dbPath = path.join(import.meta.dir, '../db/mydb.db');
    const { db, insertTrips } = createDatabase(dbPath);
    insertTrips(trips);
    tDb = performance.now();
    console.log(`5. DB insert:        ${(tDb - tMap).toFixed(0)}ms`);
    db.close();
  }

  console.log('='.repeat(50));
  const total = performance.now() - t0;
  console.log(`Total:               ${total.toFixed(0)}ms`);

  // Breakdown
  console.log('\nBreakdown:');
  const readTime = tRead - t0;
  const parseTime = tParse - tRead;
  const validateTime = tValidate - tParse;
  const mapTime = tMap - tValidate;
  const dbTime = tDb - tMap;

  console.log(`  Read:      ${((readTime / total) * 100).toFixed(1)}%`);
  console.log(`  Parse:     ${((parseTime / total) * 100).toFixed(1)}%`);
  console.log(`  Validate:  ${((validateTime / total) * 100).toFixed(1)}%`);
  console.log(`  Map:       ${((mapTime / total) * 100).toFixed(1)}%`);
  if (!skipDb) {
    console.log(`  DB:        ${((dbTime / total) * 100).toFixed(1)}%`);
  }

  // Throughput stats
  console.log('\nThroughput:');
  console.log(`  ${(validRows.length / (total / 1000)).toFixed(0)} rows/sec`);
  console.log(`  ${((fileString.length / 1024 / 1024) / (total / 1000)).toFixed(1)} MB/sec`);
}

profile();
