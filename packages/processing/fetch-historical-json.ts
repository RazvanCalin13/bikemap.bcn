import { mkdir } from "node:fs/promises";
import path from "path";
import { parseArgs } from "util";
import { dataDir } from "./utils";

// Load environment variables from .env file
const envPath = path.join(import.meta.dir, ".env");
const envFile = Bun.file(envPath);
if (await envFile.exists()) {
    const text = await envFile.text();
    console.log(`Loading .env from ${envPath}`);
    for (const line of text.split("\n")) {
        const parts = line.split("=");
        if (parts.length >= 2) {
            const key = parts[0]!.trim();
            let value = parts.slice(1).join("=").trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            if (key && !key.startsWith("#")) {
                process.env[key] = value;
            }
        }
    }
} else {
    console.warn(`⚠️  No .env file found at ${envPath}`);
}

const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        resourceId: { type: "string", short: "r", default: "f60e9291-5aaa-417d-9b91-612a9de800aa" },
        packageId: { type: "string", short: "p", default: "bd2462df-6e1e-4e37-8205-a4b8e7313b84" },
    },
});

const TOKEN = process.env.OPEN_DATA_BCN_TOKEN;
if (!TOKEN) {
    console.error("❌ Error: OPEN_DATA_BCN_TOKEN not found in .env");
    process.exit(1);
}

// Construct URL based on Open Data BCN pattern
// https://opendata-ajuntament.barcelona.cat/data/dataset/{package_id}/resource/{resource_id}/download
const URL = `https://opendata-ajuntament.barcelona.cat/data/dataset/${values.packageId}/resource/${values.resourceId}/download`;
const OUTPUT_FILE = path.join(dataDir, `bicing_station_status_${values.resourceId}.json`);

async function main() {
    console.log(`Fetching Bicing data...`);
    console.log(`URL: ${URL}`);

    await mkdir(dataDir, { recursive: true });

    const res = await fetch(URL, {
        headers: {
            "Authorization": TOKEN!,
        },
    });

    if (!res.ok) {
        console.error(`❌ Download failed: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.error(`Response: ${text.slice(0, 500)}...`);
        process.exit(1);
    }

    console.log("Download started...");
    const file = Bun.file(OUTPUT_FILE);
    await Bun.write(file, res);

    // Check file size
    const stats = await file.stat();
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`✅ Successfully downloaded to ${OUTPUT_FILE}`);
    console.log(`Size: ${sizeMb} MB`);
}

main().catch(console.error);
