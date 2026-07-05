package handlers

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type OrderHandler struct {
	orders     *services.OrderService
	scheduling *services.SchedulingService
}

func NewOrderHandler(orders *services.OrderService, scheduling *services.SchedulingService) *OrderHandler {
	return &OrderHandler{orders: orders, scheduling: scheduling}
}

type orderItemRequest struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type placeOrderRequest struct {
	VendorID     string             `json:"vendor_id"`
	Items        []orderItemRequest `json:"items"`
	DeliveryLon  float64            `json:"delivery_longitude"`
	DeliveryLat  float64            `json:"delivery_latitude"`
	CurrencyCode string             `json:"currency_code,omitempty"`
	ScheduledFor *time.Time         `json:"scheduled_for,omitempty"`
	CouponCode   string             `json:"coupon_code,omitempty"`
}

// PlaceOrder handles POST /api/v1/user/orders (blueprint §11.C9). Requires
// an Idempotency-Key header (§5.8) — the order-placement endpoint is the
// canonical use case for it, since a client retry after a dropped response
// must never double-charge/double-decrement stock.
func (h *OrderHandler) PlaceOrder(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}

	idempotencyKey := c.Request().Header.Get("Idempotency-Key")
	if idempotencyKey == "" {
		return apperror.Validation("Idempotency-Key header is required")
	}

	var req placeOrderRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.VendorID == "" {
		return apperror.Validation("vendor_id is required")
	}
	if len(req.Items) == 0 {
		return apperror.Validation("at least one item is required")
	}

	items := make([]services.OrderItemInput, 0, len(req.Items))
	for _, item := range req.Items {
		items = append(items, services.OrderItemInput{ProductID: item.ProductID, Quantity: item.Quantity})
	}

	order, appErr := h.orders.PlaceOrder(c.Request().Context(), services.PlaceOrderInput{
		UserID:         userID,
		VendorID:       req.VendorID,
		Items:          items,
		DeliveryLon:    req.DeliveryLon,
		DeliveryLat:    req.DeliveryLat,
		CurrencyCode:   req.CurrencyCode,
		ScheduledFor:   req.ScheduledFor,
		CouponCode:     req.CouponCode,
		IdempotencyKey: idempotencyKey,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": order})
}

// ListMyOrders handles GET /api/v1/user/orders (blueprint §11.C11).
func (h *OrderHandler) ListMyOrders(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	orders, appErr := h.orders.ListForUser(c.Request().Context(), userID)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": orders})
}

// GetMyOrder handles GET /api/v1/user/orders/:orderId (blueprint §11.C10).
func (h *OrderHandler) GetMyOrder(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	order, appErr := h.orders.GetForUser(c.Request().Context(), userID, c.Param("orderId"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": order})
}

// ListVendorOrders handles GET /api/v1/vendor/:id/orders (blueprint
// §11.B9, vendor-owner only).
func (h *OrderHandler) ListVendorOrders(c echo.Context) error {
	var statusFilter *models.OrderStatus
	if s := c.QueryParam("status"); s != "" {
		st := models.OrderStatus(s)
		statusFilter = &st
	}
	orders, appErr := h.orders.ListForVendor(c.Request().Context(), c.Param("id"), statusFilter)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": orders})
}

type updateOrderStatusRequest struct {
	Status models.OrderStatus `json:"status"`
}

// UpdateOrderStatus handles PUT /api/v1/vendor/:id/orders/:orderId/status
// (vendor-owner only, blueprint §11.B9).
func (h *OrderHandler) UpdateOrderStatus(c echo.Context) error {
	var req updateOrderStatusRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.orders.UpdateStatus(c.Request().Context(), c.Param("id"), c.Param("orderId"), req.Status); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// AvailableSlots handles GET /api/v1/vendors/:id/scheduling/slots — public
// (blueprint §11.C9 slot picker).
func (h *OrderHandler) AvailableSlots(c echo.Context) error {
	slots, appErr := h.scheduling.AvailableSlots(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": slots})
}

// AcceptAsDriver handles POST /api/v1/driver/orders/:orderId/accept
// (blueprint §11.D3: "first-accept wins; concurrency-safe" — driver role
// required, the concurrency safety itself lives in
// OrderService.AssignDriver's conditional UPDATE).
func (h *OrderHandler) AcceptAsDriver(c echo.Context) error {
	driverID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	if appErr := h.orders.AssignDriver(c.Request().Context(), c.Param("orderId"), driverID); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// UpdateStatusAsDriver handles PUT /api/v1/driver/orders/:orderId/status
// (blueprint §11.D4: driver transitions to on_the_way/delivered; scoped to
// the driver already assigned to the order).
func (h *OrderHandler) UpdateStatusAsDriver(c echo.Context) error {
	driverID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	var req updateOrderStatusRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.orders.UpdateStatusAsDriver(c.Request().Context(), driverID, c.Param("orderId"), req.Status); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
