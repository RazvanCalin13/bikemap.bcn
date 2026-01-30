import { DuckDBConnection } from "@duckdb/node-api";
import { glob } from "glob";
import { mkdir } from "node:fs/promises";
import path from "path";
import fs from "node:fs";
import { dataDir, outputDir } from "./utils";

// Create output directory
const occupancyDir = path.join(outputDir, "occupancy");

async function main() {
    console.log("🚴 Processing Bicing Occupancy Data (Native)...");

    await mkdir(occupancyDir, { recursive: true });

    // Find CSV files - glob requires forward slashes
    const pattern = path.join(dataDir, "*.csv").replace(/\\/g, "/");
    const csvFiles = await glob(pattern);

    if (csvFiles.length === 0) {
        console.error("❌ No CSV files found in " + dataDir);
        process.exit(1);
    }

    console.log(`Found ${csvFiles.length} CSV files.`);

    const connection = await DuckDBConnection.create();

    // Helper to read CSV header
    async function getCSVHeaders(filePath: string): Promise<string[]> {
        const fileHandle = await fs.promises.open(filePath);
        try {
            const stream = fileHandle.createReadStream({ start: 0, end: 1024 }); // Read first chunk
            for await (const chunk of stream) {
                const text = chunk.toString("utf-8");
                const firstLine = text.split(/\r?\n/)[0];
                return firstLine.split(",").map((h: string) => h.trim().replace(/^"|"$/g, ""));
            }
        } finally {
            await fileHandle.close();
        }
        return [];
    }

    for (const file of csvFiles) {
        const fileName = path.basename(file);
        console.log(`\n📄 Processing: ${fileName}`);

        const headers = await getCSVHeaders(file);

        // Validation: Check for bike availability columns
        const hasBikes = headers.includes("num_bikes_available");

        if (!hasBikes) {
            console.warn(`   ⚠️  Skipping: Missing 'num_bikes_available' column. This appears to be static station info, not status logs.`);
            continue;
        }

        // Column mapping
        const lastReportedCol = headers.includes("last_reported") ? "last_reported" :
            headers.includes("last_updated") ? "last_updated" : null;

        if (!lastReportedCol) {
            console.warn(`   ⚠️  Skipping: Missing 'last_reported' or 'last_updated' timestamp column.`);
            continue;
        }

        const parquetName = fileName.replace(/\.csv$/i, ".parquet");
        const parquetPath = path.join(occupancyDir, parquetName);

        console.log("   🔄 Converting to Parquet...");

        // Escape backslashes for Windows paths in SQL
        const msgPath = file.replace(/\\/g, "/");
        const outPath = parquetPath.replace(/\\/g, "/");

        try {
            await connection.run(`
                COPY (
                    SELECT 
                        station_id::INTEGER as station_id,
                        to_timestamp(${lastReportedCol})::TIMESTAMP as reported_at,
                        num_bikes_available::INTEGER as bikes,
                        COALESCE(num_docks_available, 0)::INTEGER as docks,
                        is_charging_station::BOOLEAN as is_charging,
                        status
                    FROM read_csv_auto('${msgPath}', HEADER=TRUE, normalize_names=true)
                    WHERE ${lastReportedCol} IS NOT NULL
                ) TO '${outPath}' (FORMAT 'parquet', CODEC 'SNAPPY');
            `);

            console.log(`   💾 Saved to: ${parquetPath}`);
        } catch (err) {
            console.error(`   ❌ Failed to convert ${fileName}:`, err);
        }
    }

    console.log("\n✅ Processing complete!");
}

main().catch(err => {
    console.error("❌ Fatal Error:", err);
    process.exit(1);
});
