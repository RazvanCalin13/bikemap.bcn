
import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";

async function main() {
    const csvPath = "d:/Work/bikemap.bcn/data/2025_01_Gener_BicingNou_ESTACIONS.csv";
    const instance = await DuckDBInstance.create();
    const conn = await instance.connect();

    // 2025-01-01 09:00 UTC = 1735722000
    // 2025-01-01 09:30 UTC = 1735723800

    console.log("Querying CSV around 2025-01-01 09:00 UTC with ALL_VARCHAR=true...");

    try {
        const result = await conn.run(`
            WITH stations AS (
                SELECT 
                  station_id::INTEGER as station_id,
                  num_bikes_available::INTEGER as bikes,
                  last_reported::BIGINT as last_reported
                FROM read_csv_auto('${csvPath}', ALL_VARCHAR=true, nullstr='NA', ignore_errors=true)
            )
            SELECT 
                station_id, 
                last_reported, 
                to_timestamp(last_reported) as time_utc,
                bikes
            FROM stations 
            WHERE station_id = 1 
              AND last_reported BETWEEN 1735720000 AND 1735725000
            ORDER BY last_reported ASC
            LIMIT 20;
        `);

        const rows = await result.getRows();
        console.log("Rows found:", rows.length);
        console.table(rows);

        if (rows.length === 0) {
            console.log("No rows found. Checking ANY rows for station 1...");
            const anyRows = await conn.run(`
                SELECT * FROM read_csv_auto('${csvPath}', ignore_errors=true) 
                WHERE station_id = 1 LIMIT 5
            `);
            console.table(await anyRows.getRows());
        }

    } catch (e) {
        console.error(e);
    }
}

main();
