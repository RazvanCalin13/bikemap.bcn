# bikemap.bcn

[bikemap.bcn](https://bikemap.bcn) is a visualization of the [Bicing](https://www.bicing.barcelona/) bike-sharing system in Barcelona, Spain. 

The application visualizes historical station occupancy and status data.

## Features
- **Historical Station Status**: View bike and dock availability over time.
- **Natural language date parsing** to jump to any moment in history.
- **Station Search**: Find specific stations by name or neighborhood.
- **Full keyboard controls** for playback and navigation.
- **Coverage** of Bicing's modern era (2019-present).

---

## Architecture

There is no traditional backend. The client uses [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview.html) to query parquet files using SQL directly from a CDN, downloading only the rows it needs via HTTP range requests.

### Data Flow
1. **Raw Data**: Anonymized station status data from [Open Data BCN](https://opendata-ajuntament.barcelona.cat/).
2. **Processing Pipeline**: 
   - **Parquet Export**: Generates daily parquet files containing station status.
3. **Client**: 
   - Queries parquets limits via DuckDB WASM.
   - Visualizes station availability using deck.gl.

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
 **Note**: If you see a `TurbopackInternalError` (common on Windows), use Webpack:
 ```bash
 bun run dev -- --webpack
 ```

Open [http://localhost:3000](http://localhost:3000) to view the app.


---

## 🛠️ Advanced: Data Processing Pipeline

If you want to generate your own data tiles or run the processing scripts, you need to set up the local routing engine and pipeline.

### Prerequisites
- [Bun](https://bun.sh/) v1.2.9+
- `wget` or `curl`

### 1. Run Processing Scripts
Once your data is in place:

```bash
cd packages/processing

# 1. Update station list from live API
bun run fetch-bicing-stations.ts

# 2. Build occupancy parquets
bun run build-occupancy.ts
```

### Outputs
- `apps/client/public/stations.json`: Station index.
- `output/parquets/<year>-<month>-<day>.parquet`: Final data files.

### 🔄 Workflow: Updating Data
To update the dataset (e.g., removing months, adding others):

1. **Update CSVs**: Add or remove `.csv` files in the **project root** `data/` directory.
2. **Clean Output**: Delete old files in `packages/processing/output/parquets` (if the folder exists) to prevent stale data from persisting.
3. **Run Pipeline**:
   *For `..._ESTACIONS.csv` files*
   ```bash
   cd packages/processing
   
   # 1. Update station list
   bun run fetch-bicing-stations.ts

   # 2. Build occupancy parquets
   bun run build-occupancy.ts
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
| `station_id` | integer | Station ID |
| `bikes` | integer | Available bikes |
| `docks` | integer | Available docks |
| `status` | string | Station status |
| `last_reported` | timestamp | Report time (UTC) |

**Timezone Handling**:
- **Raw CSV**: NYC/Local (naive)
- **Parquet**: UTC
- **Client Display**: Configured to "Europe/Madrid" or relevant local time in formatters.

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
