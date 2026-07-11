// Package handlers holds thin HTTP handlers: validate input, call one
// service, map the result to the standardized JSON response. No business
// logic and no direct DB access belongs here (blueprint §4.1).
package handlers

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/pkg/buildinfo"
)

// HealthHandler reports process liveness plus Postgres/Redis/PostGIS
// connectivity, per the Phase 1 acceptance check (blueprint §15 item 1).
type HealthHandler struct {
	db *gorm.DB
}

func NewHealthHandler(db *gorm.DB) *HealthHandler {
	return &HealthHandler{db: db}
}

type healthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
	Redis    string `json:"redis"`
	PostGIS  string `json:"postgis"`
	// Version identifies the build actually running, so "is my deploy live?"
	// can be answered with a curl instead of shell access to read the logs.
	Version string `json:"version"`
}

// Check is registered at GET /health. It always returns a body describing
// each dependency's state; the HTTP status is 200 only when every
// dependency is healthy, otherwise 503. The DB/PostGIS check and the Redis
// check are independent, so they run concurrently.
func (h *HealthHandler) Check(c echo.Context, redisPing func() error) error {
	ctx := c.Request().Context()
	resp := healthResponse{
		Status:   "ok",
		Database: "ok",
		Redis:    "ok",
		PostGIS:  "ok",
		Version:  buildinfo.Get().Version,
	}

	type dbResult struct {
		databaseOK bool
		postgisOK  bool
	}
	dbDone := make(chan dbResult, 1)
	go func() {
		var result dbResult
		if err := config.PingDatabase(ctx, h.db); err != nil {
			log.Printf("health: database ping failed: %v", err)
			dbDone <- result
			return
		}
		result.databaseOK = true

		enabled, err := config.PostGISEnabled(ctx, h.db)
		if err != nil {
			log.Printf("health: postgis check failed: %v", err)
		}
		result.postgisOK = err == nil && enabled
		dbDone <- result
	}()

	redisOK := true
	if redisPing != nil {
		if err := redisPing(); err != nil {
			log.Printf("health: redis ping failed: %v", err)
			redisOK = false
		}
	}

	result := <-dbDone
	healthy := result.databaseOK && result.postgisOK && redisOK

	if !result.databaseOK {
		resp.Database = "error"
	}
	if !result.postgisOK {
		resp.PostGIS = "error"
	}
	if !redisOK {
		resp.Redis = "error"
	}

	if !healthy {
		resp.Status = "degraded"
		return c.JSON(http.StatusServiceUnavailable, resp)
	}
	return c.JSON(http.StatusOK, resp)
}
