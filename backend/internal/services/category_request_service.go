package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// CategoryRequestService implements the vendor "request a category" queue
// (vendors can only REQUEST a new store or product category — never create
// one directly; only super_admin approval creates the row). Mirrors
// VendorApplicationService's submit/approve/reject shape, but the requester
// is already an authenticated vendor owner (no OTP verification-token step
// is needed, unlike vendor onboarding which happens pre-account).
type CategoryRequestService struct {
	db                *gorm.DB
	audit             *AuditService
	storeCategories   *StoreCategoryService
	productCategories *ProductCategoryService
}

func NewCategoryRequestService(db *gorm.DB, audit *AuditService, storeCategories *StoreCategoryService, productCategories *ProductCategoryService) *CategoryRequestService {
	return &CategoryRequestService{db: db, audit: audit, storeCategories: storeCategories, productCategories: productCategories}
}

const maxCategoryRequestNotesLength = 1000

type SubmitCategoryRequestInput struct {
	RequestedByUserID string
	VendorID          string
	Kind              models.CategoryRequestKind
	NameI18n          json.RawMessage
	ParentID          *string
	Notes             string
}

// Submit records a new pending category request (blueprint: vendors request,
// never create directly).
func (s *CategoryRequestService) Submit(ctx context.Context, in SubmitCategoryRequestInput) (*models.CategoryRequest, *apperror.AppError) {
	if in.Kind != models.CategoryRequestKindStore && in.Kind != models.CategoryRequestKindProduct {
		return nil, apperror.Validation(`kind must be "store" or "product"`)
	}
	if len(in.NameI18n) == 0 {
		return nil, apperror.Validation("name_i18n is required")
	}
	if len(in.Notes) > maxCategoryRequestNotesLength {
		return nil, apperror.Validation("notes is too long")
	}
	if in.Kind == models.CategoryRequestKindStore && in.ParentID != nil {
		return nil, apperror.Validation("a store category request cannot have a parent")
	}

	var notes *string
	if in.Notes != "" {
		notes = &in.Notes
	}

	request := models.CategoryRequest{
		ID:                newUUID(),
		Status:            models.CategoryRequestPending,
		Kind:              in.Kind,
		RequestedByUserID: in.RequestedByUserID,
		VendorID:          &in.VendorID,
		NameI18n:          in.NameI18n,
		ParentID:          in.ParentID,
		Notes:             notes,
		SubmittedAt:       time.Now(),
	}
	if err := s.db.WithContext(ctx).Create(&request).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("category_request: submit: %w", err))
	}
	return &request, nil
}

// GetByID loads a single request (used by Approve/Reject to check status).
func (s *CategoryRequestService) GetByID(ctx context.Context, id string) (*models.CategoryRequest, *apperror.AppError) {
	var request models.CategoryRequest
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&request).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("category request")
		}
		return nil, apperror.Internal(fmt.Errorf("category_request: load: %w", err))
	}
	return &request, nil
}

// List returns requests, optionally filtered by status, newest first
// (admin queue, blueprint §11.A5-style).
func (s *CategoryRequestService) List(ctx context.Context, status models.CategoryRequestStatus) ([]models.CategoryRequest, *apperror.AppError) {
	query := s.db.WithContext(ctx).Order("submitted_at DESC")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	requests := make([]models.CategoryRequest, 0)
	if err := query.Find(&requests).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("category_request: list: %w", err))
	}
	return requests, nil
}

// ListForVendor returns a vendor's own requests, newest first (vendor
// dashboard's "my requests" view).
func (s *CategoryRequestService) ListForVendor(ctx context.Context, vendorID string) ([]models.CategoryRequest, *apperror.AppError) {
	requests := make([]models.CategoryRequest, 0)
	if err := s.db.WithContext(ctx).Where("vendor_id = ?", vendorID).Order("submitted_at DESC").Find(&requests).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("category_request: list for vendor: %w", err))
	}
	return requests, nil
}

// Approve creates the requested store/product category and marks the
// request approved, linking it back via created_category_id — mirrors
// VendorApplicationService.Approve's transaction shape.
func (s *CategoryRequestService) Approve(ctx context.Context, requestID, reviewerID, reviewerIP string) (*models.CategoryRequest, *apperror.AppError) {
	request, appErr := s.GetByID(ctx, requestID)
	if appErr != nil {
		return nil, appErr
	}
	if request.Status != models.CategoryRequestPending {
		return nil, apperror.Validation("request is not pending")
	}

	var createdCategoryID string
	switch request.Kind {
	case models.CategoryRequestKindStore:
		slug, slugErr := slugify(request.NameI18n)
		if slugErr != nil {
			return nil, apperror.Validation(slugErr.Error())
		}
		created, createErr := s.storeCategories.Create(ctx, CreateStoreCategoryInput{
			NameI18n: request.NameI18n,
			Slug:     slug,
		})
		if createErr != nil {
			return nil, createErr
		}
		createdCategoryID = created.ID
	case models.CategoryRequestKindProduct:
		slug, slugErr := slugify(request.NameI18n)
		if slugErr != nil {
			return nil, apperror.Validation(slugErr.Error())
		}
		created, createErr := s.productCategories.Create(ctx, CreateProductCategoryInput{
			NameI18n: request.NameI18n,
			Slug:     slug,
			ParentID: request.ParentID,
		})
		if createErr != nil {
			return nil, createErr
		}
		createdCategoryID = created.ID
	}

	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&models.CategoryRequest{}).Where("id = ?", requestID).
		Updates(map[string]any{
			"status":              models.CategoryRequestApproved,
			"reviewed_by":         reviewerID,
			"reviewed_at":         now,
			"created_category_id": createdCategoryID,
		}).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("category_request: mark approved: %w", err))
	}

	reviewerRole := models.RoleSuperAdmin
	s.audit.Log(ctx, &reviewerID, &reviewerRole, "category_request.approve", "category_requests", &requestID, reviewerIP, map[string]any{
		"created_category_id": createdCategoryID,
		"kind":                string(request.Kind),
	})

	return s.GetByID(ctx, requestID)
}

// Reject marks a pending request rejected with a reason.
func (s *CategoryRequestService) Reject(ctx context.Context, requestID, reason, reviewerID, reviewerIP string) *apperror.AppError {
	if reason == "" {
		return apperror.Validation("reject reason is required")
	}
	request, appErr := s.GetByID(ctx, requestID)
	if appErr != nil {
		return appErr
	}
	if request.Status != models.CategoryRequestPending {
		return apperror.Validation("request is not pending")
	}

	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&models.CategoryRequest{}).Where("id = ?", requestID).
		Updates(map[string]any{
			"status":        models.CategoryRequestRejected,
			"reject_reason": reason,
			"reviewed_by":   reviewerID,
			"reviewed_at":   now,
		}).Error; err != nil {
		return apperror.Internal(fmt.Errorf("category_request: reject: %w", err))
	}

	reviewerRole := models.RoleSuperAdmin
	s.audit.Log(ctx, &reviewerID, &reviewerRole, "category_request.reject", "category_requests", &requestID, reviewerIP, map[string]any{
		"reason": reason,
	})
	return nil
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// slugify derives a URL/lookup-safe slug from a name_i18n blob (preferring
// "en", falling back to any present locale), then appends a short random
// suffix so two approved requests with the same display name never collide
// on the slug UNIQUE constraint.
func slugify(nameI18n json.RawMessage) (string, error) {
	var names map[string]string
	if err := json.Unmarshal(nameI18n, &names); err != nil {
		return "", fmt.Errorf("name_i18n must be a flat object of locale to string")
	}
	base := names["en"]
	if base == "" {
		for _, v := range names {
			base = v
			break
		}
	}
	if base == "" {
		return "", fmt.Errorf("name_i18n must have at least one non-empty locale value")
	}

	slug := strings.ToLower(strings.TrimSpace(base))
	slug = slugNonAlnum.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "category"
	}

	suffix := make([]byte, 4)
	if _, err := rand.Read(suffix); err != nil {
		return "", fmt.Errorf("slugify: generate suffix: %w", err)
	}
	return slug + "-" + hex.EncodeToString(suffix), nil
}
