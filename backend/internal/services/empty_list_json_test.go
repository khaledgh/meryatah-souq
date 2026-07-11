package services

import (
	"encoding/json"
	"strings"
	"testing"

	"meryata-souq/backend/internal/models"
)

// A nil Go slice marshals to JSON `null`, not `[]`. Every frontend parses
// list responses with a Zod `z.array(...)`, which THROWS on null — so a
// single uninitialized `var xs []T` in a service turns the entirely normal
// "no rows matched" case into a broken page. That bug shipped across ~16
// endpoints (an idle driver's request list, a new user's order history, a
// product with no images, the admin Vendors page with no active vendor...)
// before it was found.
//
// The fix is to always `make([]T, 0)`. This test pins the *contract* — that
// an empty list serializes as `[]` — so the next person who writes
// `var xs []T` and returns it has a failing test instead of a broken client.
//
// It deliberately needs no database: it asserts on the JSON encoding itself,
// so it runs anywhere, including CI without Postgres.
func TestEmptyListsMarshalAsArrayNotNull(t *testing.T) {
	t.Run("nil slice marshals to null (the bug)", func(t *testing.T) {
		var orders []models.Order
		encoded, err := json.Marshal(map[string]any{"data": orders})
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		// Documents WHY the make([]T, 0) convention exists. If this ever
		// stops being true, the convention can be relaxed.
		if !strings.Contains(string(encoded), `"data":null`) {
			t.Fatalf("expected a nil slice to marshal to null, got %s", encoded)
		}
	})

	t.Run("initialized slice marshals to [] (the contract)", func(t *testing.T) {
		orders := make([]models.Order, 0)
		encoded, err := json.Marshal(map[string]any{"data": orders})
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		if !strings.Contains(string(encoded), `"data":[]`) {
			t.Fatalf("expected an empty list to marshal to [], got %s", encoded)
		}
	})

	// The nested case, which is easy to miss: an Order carries Items, and a
	// map-miss in populateOrderItems used to leave that nil -> "items":null,
	// breaking any client on an order with no line items.
	t.Run("nested empty list marshals to []", func(t *testing.T) {
		order := models.Order{ID: "o1", Items: make([]models.OrderItem, 0)}
		encoded, err := json.Marshal(order)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		if strings.Contains(string(encoded), `"items":null`) {
			t.Fatalf("nested items must never marshal to null, got %s", encoded)
		}
	})
}
