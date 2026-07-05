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
		ctx := context.Background()
		if appErr := h.locations.Upsert(ctx, userID, lon, lat, heading); appErr != nil {
			return
		}
		payload, marshalErr := json.Marshal(map[string]any{
			"type":      "driver_location",
			"longitude": lon,
			"latitude":  lat,
			"heading":   heading,
		})
		if marshalErr != nil {
			return
		}
		_ = h.hub.Broadcast(ctx, orderID, payload)
	})

	return nil
}
