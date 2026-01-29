# bikemap.bcn

[bikemap.bcn](https://bikemap.bcn) is a visualization of the [Bicing](https://www.bicing.barcelona/) bike-sharing system in Barcelona, Spain.

Each moving arrow represents a real bike ride, based on anonymized historical system data (processed into parquets).

## Features
- GPU-accelerated rendering of thousands of concurrent rides
- Natural language date parsing to jump to any moment in history
- Search for individual rides by date and station name
- Full keyboard controls for playback and navigation
- Coverage of Bicing's modern era (2019-present)

## How it works 

There is no backend. The client uses [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview.html) to query parquet files using SQL directly from a CDN, downloading only the rows it needs via HTTP range requests.

### 1. Data processing pipeline

The raw system data spans 12 years and has significant inconsistencies, making it difficult to use directly. The processing pipeline cleans and normalizes the data into optimized parquet files.

1. **Station clustering**: Creates a list of all unique station names and their coordinates.
2. **Route generation**: Queries [OSRM](https://project-osrm.org/) for bike routes between all station pairs. Geometries are cached per pair and stored as polyline6 in an intermediate SQLite database.
3. **Parquet export**: Generates a parquet file for each day by joining each trip with its corresponding route geometry.

### 2. Client application

This is what you see when you visit [bikemap.nyc](https://bikemap.nyc).

- **Data loading**: DuckDB WASM queries parquet files from the CDN using HTTP range requests. Trips load in 30-minute batches with lookahead prefetching.
- **Processing**: A Web Worker decodes the polyline6 geometry and pre-computes timestamps with easing so that bikes slow down at station endpoints.
- **Rendering**: Heavy lifting is done with deck.gl layers on top of Mapbox.
- **Search**: Natural language date parsing via chrono-node lets you jump to any point in time or find a specific ride by querying the parquets directly.


## Quickstart

**1. Set up environment variables**

Create a `.env` file in `apps/client` and add your Mapbox token:

```sh
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx  # Get one at https://mapbox.com
```

**2. Install dependencies and run**

```sh
bun install
bun dev
```

**3. Update Stations (Optional)**

If you want to update the Bicing station list from the latest live data:

```sh
cd packages/processing
bun run fetch-bicing-stations.ts
```

**Note:** The client queries parquet files from a hosted CDN by default. See the [processing README](packages/processing/README.md) for how to generate and host your own data.


## Station Legend

The map visualizes Bicing stations as dots that change color and size based on real-time occupancy (bikes vs. total docks).

**Colors (Bike Availability):**
- 🔴 **Red**: Empty (< 10% bikes)
- 🟠 **Orange**: Low (< 50% bikes)
- 🟡 **Yellow**: Medium (< 80% bikes)
- 🟢 **Green**: High (>= 80% bikes)

**Size:**
- The size of the dot scales with the percentage of bikes available.
- Larger dots indicate a higher percentage of available bikes (more full).
- Smaller dots indicate fewer bikes relative to station capacity.

