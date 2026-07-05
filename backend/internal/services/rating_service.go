package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// postgresUniqueViolation is SQLSTATE 23505 — used to distinguish "this
// insert failed because the row already exists" from any other DB error,
// so a genuine outage isn't mislabeled as "already rated."
const postgresUniqueViolation = "23505"

// RatingService implements driver ratings (blueprint §11.C12: "once per
// order" — enforced primarily by the DB's UNIQUE constraint on
// ratings.order_id, with a friendly pre-check here so a duplicate attempt
// gets a clear error rather than a raw constraint-violation message).
type RatingService struct {
	db *gorm.DB
}

func NewRatingService(db *gorm.DB) *RatingService {
	return &RatingService{db: db}
}

// Create records a rating for a delivered order, scoped to userID (only
// the order's own customer may rate it, blueprint §5.3) and requiring the
// order be delivered (rating an order that hasn't completed makes no
// sense) and have an assigned driver.
func (s *RatingService) Create(ctx context.Context, userID, orderID string, score int, comment *string) (*models.Rating, *apperror.AppError) {
	if score < 1 || score > 5 {
		return nil, apperror.Validation("score must be between 1 and 5")
	}

	var order models.Order
	err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", orderID, userID).First(&order).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("order")
		}
		return nil, apperror.Internal(fmt.Errorf("rating: load order: %w", err))
	}
	if order.Status != models.OrderStatusDelivered {
		return nil, apperror.Validation("only delivered orders can be rated")
	}
	if order.DriverID == nil {
		return nil, apperror.Internal(fmt.Errorf("rating: delivered order %s has no assigned driver", orderID))
	}

	var existing int64
	s.db.WithContext(ctx).Model(&models.Rating{}).Where("order_id = ?", orderID).Count(&existing)
	if existing > 0 {
		return nil, apperror.Validation("this order has already been rated")
	}

	rating := models.Rating{
		ID:       newUUID(),
		OrderID:  orderID,
		DriverID: *order.DriverID,
		UserID:   userID,
		Score:    score,
		Comment:  comment,
	}
	if err := s.db.WithContext(ctx).Create(&rating).Error; err != nil {
		// The pre-check above is a UX nicety, not the source of truth —
		// the UNIQUE constraint on order_id is; a race between two
		// requests for the same order still correctly rejects the loser
		// here. But only a genuine unique-violation (SQLSTATE 23505)
		// should be relabeled as "already rated" — any other DB error
		// (connection drop, disk full, etc.) must surface as a real
		// internal error so it isn't silently hidden from logs/monitoring
		// behind a misleading validation message.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return nil, apperror.Validation("this order has already been rated")
		}
		return nil, apperror.Internal(fmt.Errorf("rating: create: %w", err))
	}
	return &rating, nil
}

// ListForDriver returns a driver's received ratings (blueprint §11.D5
// history/earnings — rating display).
func (s *RatingService) ListForDriver(ctx context.Context, driverID string) ([]models.Rating, *apperror.AppError) {
	var ratings []models.Rating
	if err := s.db.WithContext(ctx).Where("driver_id = ?", driverID).Order("created_at DESC").Find(&ratings).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("rating: list for driver: %w", err))
	}
	return ratings, nil
}
