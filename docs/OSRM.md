# OSRM routing engine

Powers `GET /api/v1/route` — the road geometry and ETA drawn on the customer's
tracking map and the driver's active-delivery map.

## Why self-hosted

The public demo server (`router.project-osrm.org`) is **not usable here**. Its
[API usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy)
restricts it to *"reasonable, non-commercial use-cases"*, caps it at 1 request
per second, and states access *"shall be withdrawn at any time and without
giving a reason"*. Self-hosting costs nothing but a container and has no quota.

## One-time setup: build the routing graph

Run once (and again whenever you want fresher map data). Everything happens in
`./osrm-data/`, which `docker-compose.yml` mounts into the container.

```bash
mkdir -p osrm-data && cd osrm-data

# 1. Download the OSM extract for your coverage area (Geofabrik).
#    Lebanon is ~30 MB. For another region, browse https://download.geofabrik.de/
wget https://download.geofabrik.de/asia/lebanon-latest.osm.pbf

# 2. Extract with the car profile.
docker run -t -v "${PWD}:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/lebanon-latest.osm.pbf

# 3-4. Build the MLD (multi-level Dijkstra) graph.
docker run -t -v "${PWD}:/data" osrm/osrm-backend \
  osrm-partition /data/lebanon-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend \
  osrm-customize /data/lebanon-latest.osrm
```

RAM needed is roughly 5× the `.pbf` size, so a country extract is trivial.

## Run

```bash
docker compose up -d osrm
```

Then point the backend at it (`backend/.env`):

```
OSRM_URL=http://localhost:5000
```

## Verify

```bash
# Directly against OSRM (note: lon,lat order — not lat,lon):
curl "http://localhost:5000/route/v1/driving/35.5018,33.8938;35.5100,33.9000?overview=full&geometries=geojson"
# → {"code":"Ok","routes":[{"geometry":{...},"duration":...,"distance":...}], ...}

# Through the backend (requires an auth token):
curl "http://localhost:8080/api/v1/route?from_lon=35.5018&from_lat=33.8938&to_lon=35.5100&to_lat=33.9000" \
  -H "Authorization: Bearer <jwt>"
# → {"data":{"geometry":{...},"duration_seconds":...,"distance_meters":...}}
```

## Notes

- Coordinates are **`lon,lat`** in OSRM's URLs and in the GeoJSON geometry it
  returns — the reverse of how coordinates are usually spoken. The backend
  passes the geometry through unchanged, so clients must not swap the pair.
- The backend caches each route in Redis for 30 minutes (`routing_service.go`),
  since the road between two fixed points doesn't change minute to minute.
- If OSRM is down the endpoint returns `503 ROUTING_UNAVAILABLE`; unreachable
  point pairs return `422 NO_ROUTE`. Neither is treated as a server fault.
- Attribution: routing data © OpenStreetMap contributors (ODbL).
