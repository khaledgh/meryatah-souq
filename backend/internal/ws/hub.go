// Package ws implements live order tracking over WebSockets (blueprint
// §4.9): one room per order, JWT-authenticated upgrade, driver location
// streaming validated and upserted into driver_locations then broadcast to
// the room, with Redis pub/sub so broadcasts reach clients connected to
// any backend instance (horizontal scale).
package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/redis/go-redis/v9"
)

// redisChannelPrefix namespaces the pub/sub channel per order room.
const redisChannelPrefix = "ws:order:"

// Hub tracks WebSocket clients grouped by order room and relays messages
// between them, using Redis pub/sub as the cross-instance transport: a
// broadcast always publishes to Redis, and this instance's own subscriber
// delivers it to locally-connected clients (including ones connected to
// this same instance) — so the broadcast path is uniform regardless of
// which instance originated it.
type Hub struct {
	redis *redis.Client

	mu    sync.RWMutex
	rooms map[string]map[*Client]struct{}
}

func NewHub(redisClient *redis.Client) *Hub {
	return &Hub{
		redis: redisClient,
		rooms: make(map[string]map[*Client]struct{}),
	}
}

// RoomMessage is the envelope published to Redis and delivered to every
// client in a room — includes the order ID so a single Redis subscription
// (see Run) can demux to the correct in-memory room.
type RoomMessage struct {
	OrderID string          `json:"order_id"`
	Payload json.RawMessage `json:"payload"`
}

// Run subscribes to all order-room channels via a Redis pattern
// subscription and fans each message out to locally-connected clients in
// that room. Blocks until ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	sub := h.redis.PSubscribe(ctx, redisChannelPrefix+"*")
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var room RoomMessage
			if err := json.Unmarshal([]byte(msg.Payload), &room); err != nil {
				log.Printf("ws: malformed room message on %q: %v", msg.Channel, err)
				continue
			}
			h.deliverLocal(room.OrderID, room.Payload)
		}
	}
}

// deliverLocal writes payload to every client currently in orderID's room
// on THIS instance. Clients connected to other instances receive it via
// their own instance's Hub.Run loop, since all instances subscribe to the
// same Redis pattern.
func (h *Hub) deliverLocal(orderID string, payload json.RawMessage) {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.rooms[orderID]))
	for c := range h.rooms[orderID] {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- payload:
		default:
			// Client's outbound buffer is full (slow consumer) — drop
			// this update rather than block the whole hub; location
			// updates are frequent enough that missing one is harmless,
			// unlike an order-status change (which order_status_service's
			// own push-notification path — not this hub — is
			// responsible for delivering reliably).
			log.Printf("ws: dropping message for slow client in room %q", orderID)
		}
	}
}

// Broadcast publishes payload to orderID's room via Redis, reaching every
// client connected to any instance.
func (h *Hub) Broadcast(ctx context.Context, orderID string, payload json.RawMessage) error {
	msg := RoomMessage{OrderID: orderID, Payload: payload}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return h.redis.Publish(ctx, redisChannelPrefix+orderID, data).Err()
}

// Join registers c as a member of orderID's room on this instance.
func (h *Hub) Join(orderID string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[orderID] == nil {
		h.rooms[orderID] = make(map[*Client]struct{})
	}
	h.rooms[orderID][c] = struct{}{}
}

// Leave removes c from orderID's room, cleaning up the room entry if it's
// now empty.
func (h *Hub) Leave(orderID string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room, ok := h.rooms[orderID]
	if !ok {
		return
	}
	delete(room, c)
	if len(room) == 0 {
		delete(h.rooms, orderID)
	}
}

// Shutdown forcibly closes every currently-connected client's underlying
// WebSocket connection, so a graceful server shutdown doesn't leave
// already-upgraded connections lingering until their TCP socket happens to
// break on its own. Each closed connection's own ReadPump/WritePump exit
// normally (a closed conn causes ReadMessage to return an error), which
// still runs their usual Leave/close(send) cleanup.
func (h *Hub) Shutdown() {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, room := range h.rooms {
		for c := range room {
			_ = c.conn.Close()
		}
	}
}
