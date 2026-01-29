import path from "path";
import { point } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const CITYBIKES_URL = "https://api.citybik.es/v2/networks/bicing";
const DISTRICTS_URL = "https://raw.githubusercontent.com/martgnz/bcn-geodata/master/districtes/districtes.geojson";
const NEIGHBORHOODS_URL = "https://raw.githubusercontent.com/martgnz/bcn-geodata/master/barris/barris.geojson";
const OUTPUT_PATH = path.join(import.meta.dir, "../../apps/client/public/stations.json");

async function fetchGeoJSON(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    return res.json();
}

async function main() {
    console.log("Fetching Bicing stations from Citybikes...");
    const [stationsRes, districtsData, neighborhoodsData] = await Promise.all([
        fetch(CITYBIKES_URL),
        fetchGeoJSON(DISTRICTS_URL),
        fetchGeoJSON(NEIGHBORHOODS_URL)
    ]);

    if (!stationsRes.ok) {
        throw new Error(`Failed to fetch stations: ${stationsRes.statusText}`);
    }

    const data = (await stationsRes.json()) as any;
    const rawStations = data.network.stations;
    console.log(`Found ${rawStations.length} stations. Processing locations...`);

    const stations = rawStations.map((s: any) => {
        // Sanitize name
        const name = s.name.trim().replace(/\s+/g, " ");
        const pt = point([s.longitude, s.latitude]);

        // Find District
        const districtFeature = districtsData.features.find((f: any) => booleanPointInPolygon(pt, f));
        const districtName = districtFeature?.properties?.NOM ?? "Unknown";

        // Find Neighborhood
        const neighborhoodFeature = neighborhoodsData.features.find((f: any) => booleanPointInPolygon(pt, f));
        const neighborhoodName = neighborhoodFeature?.properties?.NOM ?? "Unknown";

        return {
            name,
            aliases: [s.id, s.extra?.uid?.toString()].filter(Boolean),
            latitude: s.latitude,
            longitude: s.longitude,
            borough: districtName, // Renaming to borough to match existing schema if desired, or 'district'
            neighborhood: neighborhoodName,
            capacity: s.extra?.slots ?? s.free_bikes + s.empty_slots // Fallback or accurate capacity
        };
    });

    await Bun.write(OUTPUT_PATH, JSON.stringify(stations, null, 2));
    console.log(`Successfully wrote ${stations.length} stations to ${OUTPUT_PATH}`);
}

main().catch(console.error);
