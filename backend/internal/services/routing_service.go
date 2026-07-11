package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"meryata-souq/backend/internal/pkg/apperror"
)

// routeCachePrefix namespaces cached routes in Redis. A route between two
// fixed points doesn't change minute to minute, and the driver app re-asks
// for the same vendor->customer route on every screen focus, so caching
// spares the routing engine the repeat work.
const routeCachePrefix = "route:"
const routeCacheTTL = 30 * time.Minute

// RoutingService proxies the road-routing engine (OSRM). The apps never
// call it directly: keeping it behind our own endpoint means the engine
// stays swappable, responses can be cached, and no third-party host ever
// sees our users' coordinates.
type RoutingService struct {
	osrmURL string
	redis   *redis.Client
	client  *http.Client
}

func NewRoutingService(osrmURL string, redisClient *redis.Client) *RoutingService {
	return &RoutingService{
		osrmURL: osrmURL,
		redis:   redisClient,
		client:  &http.Client{Timeout: 8 * time.Second},
	}
}

// GeoJSONLineString is the route geometry, in GeoJSON's [longitude,
// latitude] coordinate order (NOT lat/lng — clients must not swap it).
type GeoJSONLineString struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

// Route is what clients get back: the road geometry to draw, plus the
// travel time and distance to show as an ETA.
type Route struct {
	Geometry        GeoJSONLineString `json:"geometry"`
	DurationSeconds float64           `json:"duration_seconds"`
	DistanceMeters  float64           `json:"distance_meters"`
}

// osrmResponse is the subset of OSRM's /route reply we consume.
type osrmResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Geometry GeoJSONLineString `json:"geometry"`
		Duration float64           `json:"duration"` // seconds
		Distance float64           `json:"distance"` // meters
	} `json:"routes"`
}

// Route returns the driving route between two points. Coordinates are
// validated by the caller (handler); this method assumes they're in range.
func (s *RoutingService) Route(ctx context.Context, fromLon, fromLat, toLon, toLat float64) (*Route, *apperror.AppError) {
	// Round the key to ~100 m (3 dp). At full precision a moving driver mints a
	// brand-new key on every GPS fix, so the cache would never hit and would
	// instead accumulate thousands of single-use entries per delivery. Rounding
	// makes consecutive fixes along a road share an entry; the route between
	// two points 100 m apart is the same road anyway.
	cacheKey := fmt.Sprintf("%s%.3f,%.3f;%.3f,%.3f", routeCachePrefix, fromLon, fromLat, toLon, toLat)
	if cached, err := s.redis.Get(ctx, cacheKey).Bytes(); err == nil {
		var route Route
		if json.Unmarshal(cached, &route) == nil {
			return &route, nil
		}
		// A corrupt cache entry is not a reason to fail the request — fall
		// through and re-fetch.
	}

	// OSRM's coordinate order is lon,lat — the opposite of how humans say it.
	url := fmt.Sprintf("%s/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson",
		s.osrmURL, fromLon, fromLat, toLon, toLat)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("routing: build request: %w", err))
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, apperror.New("ROUTING_UNAVAILABLE", 503,
			fmt.Sprintf("routing engine unreachable: %v", err),
			"Could not calculate the route. Please try again.")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("routing: read response: %w", err))
	}
	if resp.StatusCode != http.StatusOK {
		return nil, apperror.New("ROUTING_UNAVAILABLE", 503,
			fmt.Sprintf("routing engine returned status %d", resp.StatusCode),
			"Could not calculate the route. Please try again.")
	}

	var parsed osrmResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, apperror.Internal(fmt.Errorf("routing: decode response: %w", err))
	}
	if parsed.Code != "Ok" || len(parsed.Routes) == 0 {
		// e.g. "NoRoute" for unreachable points — a legitimate, expected
		// answer, not a server fault.
		return nil, apperror.New("NO_ROUTE", 422,
			fmt.Sprintf("routing engine returned code %q with %d routes", parsed.Code, len(parsed.Routes)),
			"No driving route could be found between these locations.")
	}

	best := parsed.Routes[0]
	route := &Route{
		Geometry:        best.Geometry,
		DurationSeconds: best.Duration,
		DistanceMeters:  best.Distance,
	}

	if encoded, err := json.Marshal(route); err == nil {
		if err := s.redis.Set(ctx, cacheKey, encoded, routeCacheTTL).Err(); err != nil {
			log.Printf("routing: could not cache route: %v", err)
		}
	}
	return route, nil
}
