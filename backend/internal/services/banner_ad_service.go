package services

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/storage"
)

// BannerAdService implements banner ad CRUD and the public priority-ordered
// listing (blueprint §11.A8, §11.C5: "priority orders display in user
// app"). vendor_id is nullable — null means a platform-wide ad, so admin
// (not a specific vendor) manages those; a vendor may only manage ads
// scoped to its own vendor_id.
type BannerAdService struct {
	db              *gorm.DB
	cache           *config.Cache
	storageRegistry *storage.Registry
}

func NewBannerAdService(db *gorm.DB, cache *config.Cache, storageRegistry *storage.Registry) *BannerAdService {
	return &BannerAdService{db: db, cache: cache, storageRegistry: storageRegistry}
}

// resolveImageURLs fills ImageURL for each ad from its stored ImageKey +
// StorageDriver via the storage registry. Every method that returns ads to a
// client must call this — ImageURL is a computed field (gorm:"-"), not a DB
// column, so it is empty until resolved. A failure to resolve one ad's URL
// leaves that ad's ImageURL empty (client shows its placeholder) rather than
// failing the whole list.
func (s *BannerAdService) resolveImageURLs(ctx context.Context, ads []models.BannerAd) {
	for i := range ads {
		if driver, resolveErr := s.storageRegistry.Resolve(ads[i].StorageDriver); resolveErr == nil {
			if url, urlErr := driver.URL(ctx, ads[i].ImageKey, 0); urlErr == nil {
				ads[i].ImageURL = url
			}
		}
	}
}

// ListActive returns currently-active, in-schedule-window ads, highest
// priority first (blueprint §11.C5). Public — any user/guest sees ads.
func (s *BannerAdService) ListActive(ctx context.Context) ([]models.BannerAd, *apperror.AppError) {
	now := time.Now()
	ads := make([]models.BannerAd, 0)
	err := s.db.WithContext(ctx).
		Where("is_active = true").
		Where("starts_at IS NULL OR starts_at <= ?", now).
		Where("ends_at IS NULL OR ends_at >= ?", now).
		Order("priority DESC").
		Find(&ads).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("banner_ad: list active: %w", err))
	}

	s.resolveImageURLs(ctx, ads)
	return ads, nil
}

type CreateBannerAdInput struct {
	VendorID  *string
	ImageData []byte
	TargetURL *string
	IsPaid    bool
	PriceUSD  *float64
	Priority  int
	StartsAt  *time.Time
	EndsAt    *time.Time
}

// Create validates+stores the ad image through the §5.9 pipeline and
// records the ad (blueprint §11.A8). Admin-only route (enforced by
// caller); vendor_id may be set to attribute the ad to a specific vendor
// or left nil for a platform ad.
func (s *BannerAdService) Create(ctx context.Context, in CreateBannerAdInput) (*models.BannerAd, *apperror.AppError) {
	log.Printf("banner_ad: create: received %d bytes of image data", len(in.ImageData))

	validated, err := storage.ValidateImageUpload(in.ImageData)
	if err != nil {
		log.Printf("banner_ad: create: image validation failed: %v", err)
		return nil, apperror.Validation(err.Error())
	}
	log.Printf("banner_ad: create: image validated (ext=%s, contentType=%s, %d bytes)", validated.Extension, validated.ContentType, len(validated.Data))

	objectKey, err := storage.RandomObjectKey("banner-ads", validated.Extension)
	if err != nil {
		log.Printf("banner_ad: create: object key generation failed: %v", err)
		return nil, apperror.Internal(err)
	}

	driverName, driver, resolveErr := s.storageRegistry.ResolveActive(ctx, s.cache)
	if resolveErr != nil {
		log.Printf("banner_ad: create: resolve active storage driver failed: %v", resolveErr)
		return nil, apperror.Internal(resolveErr)
	}
	log.Printf("banner_ad: create: storing object %q on driver %q", objectKey, driverName)
	if putErr := driver.Put(ctx, objectKey, bytes.NewReader(validated.Data), validated.ContentType); putErr != nil {
		log.Printf("banner_ad: create: storage Put failed for %q on %q: %v", objectKey, driverName, putErr)
		return nil, apperror.Internal(putErr)
	}
	log.Printf("banner_ad: create: object %q written successfully to driver %q", objectKey, driverName)

	ad := models.BannerAd{
		ID:            newUUID(),
		VendorID:      in.VendorID,
		ImageKey:      objectKey,
		StorageDriver: driverName,
		TargetURL:     in.TargetURL,
		IsPaid:        in.IsPaid,
		PriceUSD:      in.PriceUSD,
		Priority:      in.Priority,
		StartsAt:      in.StartsAt,
		EndsAt:        in.EndsAt,
		IsActive:      true,
	}
	if err := s.db.WithContext(ctx).Create(&ad).Error; err != nil {
		log.Printf("banner_ad: create: DB insert FAILED (%v) — deleting the just-written object %q to avoid orphaning it. THIS is why no file remains in media if the DB write keeps failing (e.g. a missing column).", err, objectKey)
		// Best-effort cleanup: the file was already written to storage, so
		// attempt to delete it rather than leaving it to accumulate
		// unbounded storage cost — same pattern as
		// ProductImageService.AddImage (Phase 6).
		if delErr := driver.Delete(ctx, objectKey); delErr != nil {
			log.Printf("banner_ad: cleanup after failed DB write also failed, object %q on driver %q may be orphaned: %v", objectKey, driverName, delErr)
		}
		return nil, apperror.Internal(fmt.Errorf("banner_ad: create: %w", err))
	}
	log.Printf("banner_ad: create: SUCCESS — ad %s created with image %q on driver %q", ad.ID, objectKey, driverName)
	// Resolve ImageURL so the create response carries a usable image link,
	// same as the list endpoints. We already hold the driver, so reuse it.
	if url, urlErr := driver.URL(ctx, objectKey, 0); urlErr == nil {
		ad.ImageURL = url
	}
	return &ad, nil
}

type UpdateBannerAdInput struct {
	VendorID  *string
	ImageData []byte // optional — when non-empty, replaces the stored image
	TargetURL *string
	IsPaid    bool
	PriceUSD  *float64
	Priority  int
	StartsAt  *time.Time
	EndsAt    *time.Time
}

// Update edits an existing ad's metadata (blueprint §11.A8 editor). The
// image is only re-uploaded when new ImageData is provided; otherwise the
// existing stored object is kept. is_active is managed separately via
// SetActive so this cannot accidentally re-activate a suspended ad.
func (s *BannerAdService) Update(ctx context.Context, adID string, in UpdateBannerAdInput) (*models.BannerAd, *apperror.AppError) {
	var ad models.BannerAd
	if err := s.db.WithContext(ctx).Where("id = ?", adID).First(&ad).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("banner ad")
		}
		return nil, apperror.Internal(fmt.Errorf("banner_ad: load for update: %w", err))
	}

	// Optional image replacement — validate + store the new object first, and
	// only delete the old one after the DB row is successfully updated, so a
	// failure never leaves the ad pointing at a deleted image.
	oldKey := ad.ImageKey
	oldDriver := ad.StorageDriver
	imageReplaced := false
	if len(in.ImageData) > 0 {
		validated, err := storage.ValidateImageUpload(in.ImageData)
		if err != nil {
			return nil, apperror.Validation(err.Error())
		}
		objectKey, keyErr := storage.RandomObjectKey("banner-ads", validated.Extension)
		if keyErr != nil {
			return nil, apperror.Internal(keyErr)
		}
		driverName, driver, resolveErr := s.storageRegistry.ResolveActive(ctx, s.cache)
		if resolveErr != nil {
			return nil, apperror.Internal(resolveErr)
		}
		if putErr := driver.Put(ctx, objectKey, bytes.NewReader(validated.Data), validated.ContentType); putErr != nil {
			return nil, apperror.Internal(putErr)
		}
		ad.ImageKey = objectKey
		ad.StorageDriver = driverName
		imageReplaced = true
	}

	ad.VendorID = in.VendorID
	ad.TargetURL = in.TargetURL
	ad.IsPaid = in.IsPaid
	ad.PriceUSD = in.PriceUSD
	ad.Priority = in.Priority
	ad.StartsAt = in.StartsAt
	ad.EndsAt = in.EndsAt

	if err := s.db.WithContext(ctx).Model(&models.BannerAd{}).Where("id = ?", adID).
		Updates(map[string]any{
			"vendor_id":      ad.VendorID,
			"image_key":      ad.ImageKey,
			"storage_driver": ad.StorageDriver,
			"target_url":     ad.TargetURL,
			"is_paid":        ad.IsPaid,
			"price_usd":      ad.PriceUSD,
			"priority":       ad.Priority,
			"starts_at":      ad.StartsAt,
			"ends_at":        ad.EndsAt,
		}).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("banner_ad: update: %w", err))
	}

	if imageReplaced {
		if driver, resolveErr := s.storageRegistry.Resolve(oldDriver); resolveErr == nil {
			if delErr := driver.Delete(ctx, oldKey); delErr != nil {
				log.Printf("banner_ad: update replaced image but old object %q on driver %q may be orphaned: %v", oldKey, oldDriver, delErr)
			}
		}
	}
	// Resolve ImageURL so the update response carries a usable image link.
	if driver, resolveErr := s.storageRegistry.Resolve(ad.StorageDriver); resolveErr == nil {
		if url, urlErr := driver.URL(ctx, ad.ImageKey, 0); urlErr == nil {
			ad.ImageURL = url
		}
	}
	return &ad, nil
}

// SetActive toggles an ad on/off (admin-only).
func (s *BannerAdService) SetActive(ctx context.Context, adID string, active bool) *apperror.AppError {
	if err := s.db.WithContext(ctx).Model(&models.BannerAd{}).Where("id = ?", adID).
		Update("is_active", active).Error; err != nil {
		return apperror.Internal(fmt.Errorf("banner_ad: set active: %w", err))
	}
	return nil
}

// Delete removes an ad's DB row and best-effort deletes its stored image.
func (s *BannerAdService) Delete(ctx context.Context, adID string) *apperror.AppError {
	var ad models.BannerAd
	if err := s.db.WithContext(ctx).Where("id = ?", adID).First(&ad).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return apperror.NotFound("banner ad")
		}
		return apperror.Internal(fmt.Errorf("banner_ad: load: %w", err))
	}
	if err := s.db.WithContext(ctx).Delete(&ad).Error; err != nil {
		return apperror.Internal(fmt.Errorf("banner_ad: delete: %w", err))
	}
	if driver, resolveErr := s.storageRegistry.Resolve(ad.StorageDriver); resolveErr == nil {
		_ = driver.Delete(ctx, ad.ImageKey)
	}
	return nil
}

// List returns all banner ads for admin management (blueprint §11.A8),
// regardless of active/schedule status.
func (s *BannerAdService) List(ctx context.Context) ([]models.BannerAd, *apperror.AppError) {
	ads := make([]models.BannerAd, 0)
	if err := s.db.WithContext(ctx).Order("priority DESC").Find(&ads).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("banner_ad: list: %w", err))
	}
	s.resolveImageURLs(ctx, ads)
	return ads, nil
}
