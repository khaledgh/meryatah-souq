package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeTimeout bounds a single WS write so a stalled client can't hang
	// the writer goroutine indefinitely.
	writeTimeout = 10 * time.Second
	// pongTimeout / pingInterval implement the standard gorilla/websocket
	// keepalive pattern: the server pings periodically; if a pong isn't
	// seen within pongTimeout, the connection is presumed dead and closed.
	pongTimeout  = 60 * time.Second
	pingInterval = (pongTimeout * 9) / 10
	// sendBufferSize bounds per-client backpressure — see Hub.deliverLocal's
	// drop-on-full behavior.
	sendBufferSize = 32
)

// Client wraps one WebSocket connection: a user or driver watching (or
// driving) a specific order's room. Role determines what inbound messages
// are accepted from it — only a driver client may send location updates
// (blueprint §5: never trust client-asserted identity for the write path;
// UserID/Role come from the JWT validated at upgrade time, not from
// anything the client sends over the socket).
type Client struct {
	conn    *websocket.Conn
	hub     *Hub
	orderID string
	userID  string
	role    string
	send    chan json.RawMessage
}

func NewClient(conn *websocket.Conn, hub *Hub, orderID, userID, role string) *Client {
	return &Client{
		conn:    conn,
		hub:     hub,
		orderID: orderID,
		userID:  userID,
		role:    role,
		send:    make(chan json.RawMessage, sendBufferSize),
	}
}

// WritePump delivers queued outbound messages (from Hub.deliverLocal) to
// the socket, and drives the ping/pong keepalive. Runs until send is
// closed or a write fails.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	defer c.conn.Close()

	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ReadPump reads inbound messages from the socket. Only driver-role
// clients are expected to send anything (location updates); onLocation is
// invoked for each valid one. Runs until the connection closes or a read
// error occurs, at which point it leaves the hub room.
func (c *Client) ReadPump(onLocation func(lon, lat, heading float64)) {
	defer func() {
		c.hub.Leave(c.orderID, c)
		close(c.send)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(4096)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongTimeout))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongTimeout))
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		if c.role != "driver" {
			// Non-driver clients (users watching) are read-only observers
			// — any inbound message from them is simply ignored, not an
			// error, since a client sending nothing is the expected case
			// and we don't want to close their connection over it.
			continue
		}

		var msg struct {
			Longitude float64 `json:"longitude"`
			Latitude  float64 `json:"latitude"`
			Heading   float64 `json:"heading"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("ws: malformed location message from driver %s: %v", c.userID, err)
			continue
		}
		if !validLongitude(msg.Longitude) || !validLatitude(msg.Latitude) {
			log.Printf("ws: driver %s sent out-of-range coordinates (%f, %f)", c.userID, msg.Longitude, msg.Latitude)
			continue
		}
		onLocation(msg.Longitude, msg.Latitude, msg.Heading)
	}
}

func validLongitude(lon float64) bool { return lon >= -180 && lon <= 180 }
func validLatitude(lat float64) bool  { return lat >= -90 && lat <= 90 }
