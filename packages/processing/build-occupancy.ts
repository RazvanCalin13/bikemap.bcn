
import * as duckdb from "@duckdb/duckdb-wasm";
import { Worker } from "worker_threads";
import { glob } from "glob";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "path";
import { dataDir, outputDir } from "./utils";
import fs from "node:fs";

// Create output directory
const occupancyDir = path.join(outputDir, "occupancy");
await mkdir(occupancyDir, { recursive: true });

async function main() {
    console.log("🚴 Processing Bicing Occupancy Data (Async WASM)...");

    // Locating WASM bundles
    // We try to find them in node_modules relative to this script or CWD
    const basePaths = [
        path.resolve(process.cwd(), "node_modules"),
        path.resolve(path.dirname(import.meta.file), "../../node_modules"),
        path.resolve(path.dirname(import.meta.file), "node_modules"),
    ];

    let duckDBDist;
    for (const p of basePaths) {
        const check = path.join(p, "@duckdb/duckdb-wasm", "dist");
        if (fs.existsSync(check)) {
            duckDBDist = check;
            break;
        }
    }

    if (!duckDBDist) {
        duckDBDist = path.join(process.cwd(), "node_modules/@duckdb/duckdb-wasm/dist");
    }

    console.log(`   🔎 Using DuckDB WASM from: ${duckDBDist}`);

    const MANUAL_BUNDLE = {
        mvp: {
            mainModule: path.join(duckDBDist, "duckdb-mvp.wasm"),
            mainWorker: path.join(duckDBDist, "duckdb-node-mvp.worker.cjs"),
        },
        eh: {
            mainModule: path.join(duckDBDist, "duckdb-eh.wasm"),
            mainWorker: path.join(duckDBDist, "duckdb-node-eh.worker.cjs"),
        },
    };

    console.log("   🦆 Initializing DuckDB Async...");
    const logger = new duckdb.ConsoleLogger();

    // Create Worker and Polyfill it for Web Worker compatibility
    const worker = new Worker(MANUAL_BUNDLE.mvp.mainWorker);

    // Polyfill addEventListener/removeEventListener
    const workerAny = worker as any;
    if (!workerAny.addEventListener) {
        workerAny.addEventListener = (type: string, listener: any) => {
            // Node worker 'message' sends data directly, Web Worker sends Event with .data
            // We need to verify what DuckDB Expects.
            // If we are using duckdb-node.cjs, it might expect simple data?
            // However, the error was 'addEventListener is not a function'.
            // Let's just bind 'on' first.
            worker.on(type, listener);
        };
    }
    if (!workerAny.removeEventListener) {
        workerAny.removeEventListener = (type: string, listener: any) => {
            worker.off(type, listener);
        };
    }

    const db = new duckdb.AsyncDuckDB(logger, workerAny);
    await db.instantiate(MANUAL_BUNDLE.mvp.mainModule);
    const conn = await db.connect();

    try {
        console.log(`Using Data Directory: ${dataDir}`);
        const files = await readdir(dataDir);
        const csvFiles = files.filter(f => f.toLowerCase().endsWith(".csv")).map(f => path.join(dataDir, f));

        if (csvFiles.length === 0) {
            console.error("❌ No CSV files found.");
            process.exit(1);
        }

        console.log(`Found ${csvFiles.length} CSV files.`);

        for (const file of csvFiles) {
            const fileName = path.basename(file);
            console.log(`\n📄 Processing: ${fileName}`);

            // Read file into buffer
            const buffer = await readFile(file);

            // Register file in DuckDB Virtual FS
            await db.registerFileBuffer(fileName, new Uint8Array(buffer));

            const parquetName = fileName.replace(".csv", ".parquet").replace(".CSV", ".parquet");
            const parquetPath = path.join(occupancyDir, parquetName);

            console.log("   🔄 Converting to Parquet...");

            // Run Query
            // Note: Virtual FS works well in Async mode
            await conn.query(`
                COPY (
                    SELECT 
                        station_id::INTEGER as station_id,
                        to_timestamp(last_reported)::TIMESTAMP as reported_at,
                        num_bikes_available::INTEGER as bikes,
                        num_docks_available::INTEGER as docks,
                        is_charging_station::BOOLEAN as is_charging,
                        status
                    FROM read_csv_auto('${fileName}', HEADER=TRUE)
                    WHERE last_reported IS NOT NULL
                ) TO '${parquetName}' (FORMAT 'parquet', CODEC 'SNAPPY');
            `);

            // Read output
            const parquetBuffer = await db.copyFileToBuffer(parquetName);
            await writeFile(parquetPath, parquetBuffer);

            console.log(`   💾 Saved to: ${parquetPath}`);
            console.log(`      Size: ${(parquetBuffer.length / 1024 / 1024).toFixed(2)} MB`);

            // Cleanup
            await db.registerFileBuffer(fileName, new Uint8Array(0));
            // db.dropFile available?
        }

        console.log("\n✅ Processing complete!");

    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    } finally {
        if (db) await db.terminate();
        worker.terminate();
    }
}

// @ts-ignore
if (import.meta.main) {
    main();
}
