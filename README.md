# bikemap.bcn

[bikemap.bcn](https://bikemap.bcn) is a visualization of the [Bicing](https://www.bicing.barcelona/) bike-sharing system in Barcelona, Spain. 

Each moving arrow represents a real bike ride, based on anonymized historical system data (processed into parquets).

## Features
- **GPU-accelerated rendering** of thousands of concurrent rides
- **Natural language date parsing** to jump to any moment in history
- **Search** for individual rides by date and station name
- **Full keyboard controls** for playback and navigation
- **Coverage** of Bicing's modern era (2019-present)

---

## Architecture

There is no traditional backend. The client uses [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview.html) to query parquet files using SQL directly from a CDN, downloading only the rows it needs via HTTP range requests.

### Data Flow
1. **Raw Data**: Anonymized trip data from [Open Data BCN](https://opendata-ajuntament.barcelona.cat/).
2. **Processing Pipeline**: 
   - **Station Clustering**: Unifies station names and coordinates.
   - **Routing**: Queries [OSRM](https://project-osrm.org/) for bike routes between all station pairs.
   - **Parquet Export**: Generates daily parquet files with embedded route geometries (polyline6).
3. **Client**: 
   - Queries parquets limits via DuckDB WASM.
   - Decodes geometries and animates rides using deck.gl.

---


## 🚀 Quickstart: Running the Client

### 1. Install Dependencies
```bash
bun install
```

### 2. Environment Setup
Create a `.env` file in `apps/client` and add your Mapbox token:
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx  # Get one at https://mapbox.com
```

### 3. Run Development Server
```bash
bun dev
```
> **Note**: If you see a `TurbopackInternalError` (common on Windows), use Webpack:
> ```bash
> bun run dev -- --webpack
> ```

Open [http://localhost:3000](http://localhost:3000) to view the app.


---

## 🛠️ Advanced: Data Processing Pipeline

If you want to generate your own data tiles or run the processing scripts, you need to set up the local routing engine and pipeline.

### Prerequisites
- [Bun](https://bun.sh/) v1.2.9+
- [Docker](https://www.docker.com/) (for OSRM routing server)
- `wget` or `curl`

### 1. Set Up OSRM Routing Server
The pipeline needs a local OSRM server.

```bash
cd packages/processing/osrm

# 1. Download Barcelona OSM data (~20MB)
curl -O https://download.bbbike.org/osm/bbbike/Barcelona/Barcelona.osm.pbf

# 2. Build routing graph (one-time, ~1 min)
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /data/bicycle-no-ferry.lua /data/Barcelona.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/Barcelona.osrm
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/Barcelona.osrm

# 3. Start server (runs on localhost:5000)
docker run --rm -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/Barcelona.osrm
```

### 2. Run Processing Scripts
Once OSRM is running on port 5000:

```bash
cd packages/processing

# 1. Update station list from live API
bun run fetch-bicing-stations.ts

# 2. Build route cache from OSRM
bun run build-routes.ts

# 3. Build trips parquet with embedded route geometries
bun run build-parquet.ts
```

### Outputs
- `apps/client/public/stations.json`: Station index.
- `output/routes.db`: SQLite cache of routes.
- `output/parquets/<year>-<month>-<day>.parquet`: Final data files.

### 🔄 Workflow: Updating Data
To update the dataset (e.g., removing months, adding others):

1. **Update CSVs**: Add or remove `.csv` files in the **project root** `data/` directory.
2. **Clean Output**: Delete old files in `packages/processing/output/parquets` (if the folder exists) to prevent stale data from persisting.
3. **Run Pipeline**:

   **Option A: Updating Station Status (Occupancy)**
   *For `..._ESTACIONS.csv` files*
   ```bash
   cd packages/processing
   
   # 1. Update station list
   bun run fetch-bicing-stations.ts

   # 2. Build occupancy parquets
   bun run build-occupancy.ts
   ```

   **Option B: Updating Trip History**
   *For Trip CSV files (with start/end stations)*
   ```bash
   cd packages/processing

   # 1. Update station list
   bun run fetch-bicing-stations.ts

   # 2. Update routes (requires OSRM server running)
   bun run build-routes.ts

   # 3. Build trip parquets
   bun run build-parquet.ts
   ```


---

## 📚 Technical Details

### Station Legend (Client)
The map visualizes stations as dots changing color/size based on occupancy:
- 🔴 **Red**: Empty (< 10% bikes)
- 🟠 **Orange**: Low (< 50% bikes)
- 🟡 **Yellow**: Medium (< 80% bikes)
- 🟢 **Green**: High (>= 80% bikes)

size scales with absolute bike availability.

### Schema & Data Handling (Processing)

**Parquet Schema**:
| Column | Type | Description |
|--------|------|-------------|
| `id` | string | Trip ID |
| `startStationName` | string | Canonical station name |
| `startedAt` | timestamp | Trip start (UTC) |
| `routeGeometry` | string | Polyline6-encoded route |
| ... | ... | See `packages/processing/README.md` history for full details |

**Timezone Handling**:
- **Raw CSV**: NYC/Local (naive)
- **Parquet**: UTC
- **Client Display**: Configured to "America/New_York" or relevant local time in formatters.

**Legacy vs Modern Data**:
The pipeline unifies legacy (2013-2019) and modern (2020+) Bicing data formats by keying everything on **Station Names** (mapped via aliases) rather than IDs, which have changed over time.

---

## ☁️ Deployment

### Hosting Infrastructure
The project is designed to be hosted on **Cloudflare**:
1. **Frontend**: Cloudflare Pages (Next.js preset)
2. **Data Storage**: Cloudflare R2 (for accessing large JSON/Parquet datasets via DuckDB WASM)

### Deployment Steps

1. **Cloudflare R2 (Data Storage)**
   - Create a bucket named `bikemap-data`.
   - Configure **CORS** to allow GET requests from your domain.
   - Upload the `recurs.json` (or parquet files) to the bucket.
   - Enable **Public Bucket Access** or connect a domain (e.g., `data.bikemap.bcn`).

2. **Cloudflare Pages (Frontend)**
   - Connect your GitHub repository to Cloudflare Pages.
   - **Build Command**: `npm run build` (or `bun run build`)
   - **Build Output**: `.next`
   - **Environment Variables**:
     - `NEXT_PUBLIC_MAPBOX_TOKEN`: Your Mapbox GL JS token.
     - `NEXT_PUBLIC_DATA_URL`: The public URL of your R2 bucket (e.g., `https://data.bikemap.bcn/recurs.json`).
