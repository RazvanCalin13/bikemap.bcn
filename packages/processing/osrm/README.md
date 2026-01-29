# Barcelona Bike Routing with OSRM

Bike-only routing for Barcelona using OSRM, with ferries excluded.

## Prerequisites

- Docker
- wget

## Quick Start

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

Steps 1-2 only need to run once. After that, just run step 3 to start the server.

> **Performance:** OSRM defaults to 8 threads. For high-concurrency batch jobs (like `build-routes.ts` with 50 concurrent requests), increase with `--threads N` where N ≤ number of CPU cores. Requests exceeding thread count queue automatically.
>
> ```bash
> # Example: 12-core machine
> docker run --rm -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
>   osrm-routed --algorithm mld --threads 12 /data/Barcelona.osrm 2>/dev/null
> ```

## Usage

The API runs on `http://localhost:5000`.

### Route Request

```
GET /route/v1/bicycle/{lon1},{lat1};{lon2},{lat2}
```

### Example

Sagrada Família to Plaça de Catalunya:

```bash
curl "http://127.0.0.1:5000/route/v1/bicycle/2.1744,41.4036;2.1694,41.3870?overview=full"
```

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `overview` | `full`, `simplified`, or `false` - geometry detail level |
| `steps` | `true` or `false` - include turn-by-turn instructions |
| `geometries` | `polyline`, `polyline6`, or `geojson` - geometry format |
| `alternatives` | `true` or `false` - return alternative routes |

## Custom Profile

`bicycle-no-ferry.lua` is a modified OSRM bicycle profile with ferry routes disabled. This ensures all routes use streets and cycle paths only.
