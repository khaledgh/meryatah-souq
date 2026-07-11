package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
	"meryata-souq/backend/internal/ws"
)

type WSHandler struct {
	hub       *ws.Hub
	locations *services.DriverLocationService
	tickets   *services.WSTicketService
	upgrader  websocket.Upgrader
}

func NewWSHandler(hub *ws.Hub, locations *services.DriverLocationService, tickets *services.WSTicketService, allowedOrigins []string) *WSHandler {
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[o] = struct{}{}
	}
	return &WSHandler{
		hub:       hub,
		locations: locations,
		tickets:   tickets,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// Origin is a browser-only concept: React Native/Expo clients
			// (the driver app, the primary producer of location data) never
			// send an Origin header, so rejecting requests with none would
			// lock out the driver app entirely. The real access-control
			// boundary here is the ticket + AssertOrderAccess ownership
			// check that runs before Upgrade is ever called — CheckOrigin is
			// only a defense-in-depth layer against a malicious *website*
			// silently opening a socket using a browser user's session, so
			// it only needs to reject a browser request whose Origin is
			// present but not allowlisted, not reject the absence of Origin
			// altogether.
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				_, ok := originSet[origin]
				return ok
			},
		},
	}
}

// IssueTicket handles POST /api/v1/ws/ticket (normal Authorization-header
// auth, RequireAuth). Returns a one-time, ~30s-lived ticket the client
// immediately uses as the WS handshake's query token, so the long-lived
// access JWT never appears in a URL — a JWT there would commonly end up in
// reverse-proxy/load-balancer access logs (blueprint §5.10: no secrets in
// logs), whereas a burned-in-30-seconds ticket is worthless if captured.
func (h *WSHandler) IssueTicket(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	role, _ := appmw.Role(c)

	ticket, appErr := h.tickets.IssueTicket(c.Request().Context(), userID, role)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": echo.Map{"ticket": ticket}})
}

// DriverLocation handles GET /api/v1/orders/:orderId/driver-location
// (authed). Returns the assigned driver's LAST KNOWN position so a client
// opening the tracking map can render the marker immediately, instead of
// staring at an empty map until the next WebSocket frame arrives — which
// may be seconds away, or never if the driver's app is backgrounded.
// Access is gated by the same ownership check as the WS room, so only the
// order's customer, its driver, or its vendor owner can read it.
func (h *WSHandler) DriverLocation(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	role, _ := appmw.Role(c)

	orderID := c.Param("orderId")
	if appErr := h.locations.AssertOrderAccess(c.Request().Context(), orderID, userID, role); appErr != nil {
		return appErr
	}

	driverID, appErr := h.locations.DriverForOrder(c.Request().Context(), orderID)
	if appErr != nil {
		return appErr
	}
	if driverID == "" {
		// No driver assigned yet — a normal state, not an error.
		return c.JSON(http.StatusOK, echo.Map{"data": nil})
	}

	lon, lat, heading, found, appErr := h.locations.GetCurrent(c.Request().Context(), driverID)
	if appErr != nil {
		return appErr
	}
	if !found {
		// Driver assigned but has never reported a position.
		return c.JSON(http.StatusOK, echo.Map{"data": nil})
	}

	return c.JSON(http.StatusOK, echo.Map{"data": echo.Map{
		"longitude": lon,
		"latitude":  lat,
		"heading":   heading,
	}})
}

// TrackOrder handles GET /api/v1/ws/orders/:orderId/track — the live
// tracking WebSocket (blueprint §4.9, §11.C10/D4). Authenticated via a
// one-time ticket (see IssueTicket) passed as a query parameter —
// WebSocket upgrades can't carry a normal Authorization header from
// browser/RN clients, and a ticket is safe to put in a URL precisely
// because it's single-use and expires in seconds, unlike a real access
// token. An invalid, expired, or already-consumed ticket is rejected with
// a normal HTTP error, never a silently-accepted unauthenticated socket.
func (h *WSHandler) TrackOrder(c echo.Context) error {
	ticket := c.QueryParam("ticket")
	if ticket == "" {
		return apperror.Unauthorized("missing ticket query parameter")
	}
	userID, role, appErr := h.tickets.ConsumeTicket(c.Request().Context(), ticket)
	if appErr != nil {
		return appErr
	}

	orderID := c.Param("orderId")
	if appErr := h.locations.AssertOrderAccess(c.Request().Context(), orderID, userID, role); appErr != nil {
		return appErr
	}

	conn, err := h.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return apperror.Internal(err)
	}

	client := ws.NewClient(conn, h.hub, orderID, userID, role)
	h.hub.Join(orderID, client)

	go client.WritePump()
	client.ReadPump(func(lon, lat, heading float64) {
		_ = h.publishDriverLocation(context.Background(), orderID, userID, lon, lat, heading)
	})

	return nil
}

// publishDriverLocation persists a driver's position and fans it out to the
// order's tracking room. Shared by both producers of location data: the
// WebSocket (used while the driver app is in the foreground) and
// ReportLocation below (used by the background task, which has no socket).
func (h *WSHandler) publishDriverLocation(ctx context.Context, orderID, driverID string, lon, lat, heading float64) *apperror.AppError {
	if appErr := h.locations.Upsert(ctx, driverID, lon, lat, heading); appErr != nil {
		return appErr
	}
	payload, err := json.Marshal(map[string]any{
		"type":      "driver_location",
		"longitude": lon,
		"latitude":  lat,
		"heading":   heading,
	})
	if err != nil {
		return apperror.Internal(err)
	}
	// A failed broadcast is not worth failing the caller over — the position
	// is already persisted, so the next reader still gets it via
	// GET /orders/:orderId/driver-location.
	_ = h.hub.Broadcast(ctx, orderID, payload)
	return nil
}

type reportLocationRequest struct {
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	Heading   float64 `json:"heading"`
}

// ReportLocation handles POST /api/v1/driver/location (driver-authed).
//
// This is the background-tracking path: once the driver app is backgrounded
// its WebSocket dies with the React tree, and a headless location task has
// no socket to write to — so it POSTs here instead and the server does the
// room broadcast on its behalf. Without this, the customer's tracking map
// freezes the moment the driver switches apps.
//
// The order is resolved server-side from the driver's own active order —
// never taken from the request — so a driver can only ever publish into a
// room they are actually assigned to.
func (h *WSHandler) ReportLocation(c echo.Context) error {
	driverID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}

	var req reportLocationRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.Longitude < -180 || req.Longitude > 180 {
		return apperror.Validation("longitude is out of range")
	}
	if req.Latitude < -90 || req.Latitude > 90 {
		return apperror.Validation("latitude is out of range")
	}

	ctx := c.Request().Context()
	orderID, appErr := h.locations.ActiveOrderForDriver(ctx, driverID)
	if appErr != nil {
		return appErr
	}
	if orderID == "" {
		// No delivery in flight: still record the position (it feeds the
		// nearby-orders match), but there is no room to broadcast into.
		if appErr := h.locations.Upsert(ctx, driverID, req.Longitude, req.Latitude, req.Heading); appErr != nil {
			return appErr
		}
		return c.NoContent(http.StatusNoContent)
	}

	if appErr := h.publishDriverLocation(ctx, orderID, driverID, req.Longitude, req.Latitude, req.Heading); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
