package services

import (
	"bytes"
	"context"
	"fmt"
	"log"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/storage"
)

// ProductImageService attaches/detaches product images through the §5.9
// upload validation pipeline (blueprint §4.4, §5.9). Each stored image
// records the driver it lives on, so switching the platform's active
// driver later never breaks previously uploaded images.
//
// Every method takes vendorID and verifies productID belongs to that
// vendor before touching any image row (blueprint §5.3): the route's
// RequireVendorOwnership middleware only proves the caller owns the
// vendor in the URL's :id — it has no way to know whether :productId also
// belongs to that vendor, so this service is the layer that must enforce
// it, exactly like ProductService.Update/Delete already do by scoping
// their SQL with "WHERE id = ? AND vendor_id = ?".
type ProductImageService struct {
	db              *gorm.DB
	cache           *config.Cache
	storageRegistry *storage.Registry
}

func NewProductImageService(db *gorm.DB, cache *config.Cache, storageRegistry *storage.Registry) *ProductImageService {
	return &ProductImageService{db: db, cache: cache, storageRegistry: storageRegistry}
}

// assertProductOwnership confirms productID belongs to vendorID, returning
// apperror.NotFound if not (rather than Forbidden, so a caller probing for
// other vendors' product IDs can't distinguish "wrong vendor" from
// "doesn't exist").
func (s *ProductImageService) assertProductOwnership(ctx context.Context, vendorID, productID string) *apperror.AppError {
	var count int64
	if err := s.db.WithContext(ctx).Model(&models.Product{}).
		Where("id = ? AND vendor_id = ?", productID, vendorID).
		Count(&count).Error; err != nil {
		return apperror.Internal(fmt.Errorf("product_image: verify product ownership: %w", err))
	}
	if count == 0 {
		return apperror.NotFound("product")
	}
	return nil
}

// AddImage validates and stores an uploaded image, records it against the
// product, and returns the new row (with a resolved URL).
func (s *ProductImageService) AddImage(ctx context.Context, vendorID, productID string, data []byte, sortOrder int) (*models.ProductImage, *apperror.AppError) {
	if appErr := s.assertProductOwnership(ctx, vendorID, productID); appErr != nil {
		return nil, appErr
	}

	validated, err := storage.ValidateImageUpload(data)
	if err != nil {
		return nil, apperror.Validation(err.Error())
	}

	objectKey, err := storage.RandomObjectKey("products/"+productID, validated.Extension)
	if err != nil {
		return nil, apperror.Internal(err)
	}

	driverName, driver, err := s.storageRegistry.ResolveActive(ctx, s.cache)
	if err != nil {
		return nil, apperror.Internal(err)
	}
	if err := driver.Put(ctx, objectKey, bytes.NewReader(validated.Data), validated.ContentType); err != nil {
		return nil, apperror.Internal(err)
	}

	img := models.ProductImage{
		ID:            newUUID(),
		ProductID:     productID,
		StorageDriver: driverName,
		ObjectKey:     objectKey,
		SortOrder:     sortOrder,
	}
	if err := s.db.WithContext(ctx).Create(&img).Error; err != nil {
		// Best-effort cleanup: the file was already written to storage, so
		// attempt to delete it rather than leaving it to accumulate
		// unbounded storage cost. If this delete also fails, the object is
		// orphaned — still safer than a dangling DB row with no backing
		// file (which would 404 on every read), but not free, hence the
		// attempt rather than accepting the leak silently.
		if delErr := driver.Delete(ctx, objectKey); delErr != nil {
			log.Printf("product_image: cleanup after failed DB write also failed, object %q on driver %q may be orphaned: %v", objectKey, driverName, delErr)
		}
		return nil, apperror.Internal(fmt.Errorf("product_image: create record: %w", err))
	}

	if url, err := driver.URL(ctx, objectKey, 0); err == nil {
		img.URL = url
	}
	return &img, nil
}

// RemoveImage deletes an image, verifying productID belongs to vendorID and
// scoping by product_id so a caller can't delete another product's image by
// guessing its ID. Best-effort deletes the underlying object using the
// driver IT was stored on (not the currently active one), since that's the
// only driver guaranteed to have the file.
func (s *ProductImageService) RemoveImage(ctx context.Context, vendorID, productID, imageID string) *apperror.AppError {
	if appErr := s.assertProductOwnership(ctx, vendorID, productID); appErr != nil {
		return appErr
	}

	var img models.ProductImage
	err := s.db.WithContext(ctx).Where("id = ? AND product_id = ?", imageID, productID).First(&img).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return apperror.NotFound("product image")
		}
		return apperror.Internal(fmt.Errorf("product_image: load: %w", err))
	}

	if err := s.db.WithContext(ctx).Delete(&img).Error; err != nil {
		return apperror.Internal(fmt.Errorf("product_image: delete record: %w", err))
	}

	if driver, resolveErr := s.storageRegistry.Resolve(img.StorageDriver); resolveErr == nil {
		_ = driver.Delete(ctx, img.ObjectKey)
	}
	return nil
}

// Reorder updates sort_order for a set of images belonging to productID,
// after verifying productID belongs to vendorID.
func (s *ProductImageService) Reorder(ctx context.Context, vendorID, productID string, orderedImageIDs []string) *apperror.AppError {
	if appErr := s.assertProductOwnership(ctx, vendorID, productID); appErr != nil {
		return appErr
	}

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i, imageID := range orderedImageIDs {
			result := tx.Model(&models.ProductImage{}).
				Where("id = ? AND product_id = ?", imageID, productID).
				Update("sort_order", i)
			if result.Error != nil {
				return result.Error
			}
		}
		return nil
	})
	if txErr != nil {
		return apperror.Internal(fmt.Errorf("product_image: reorder: %w", txErr))
	}
	return nil
}
