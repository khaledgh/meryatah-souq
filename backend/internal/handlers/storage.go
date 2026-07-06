package handlers

import (
	"bytes"
	"io"
	"net/http"
	"os"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/storage"
)

// StorageHandler exposes the storage pipeline's HTTP surface: an
// authenticated route to serve locally-stored files, and (until a real
// feature like product images lands in Phase 6) a minimal authenticated
// upload endpoint to prove the §5.9 pipeline end-to-end.
type StorageHandler struct {
	local    *storage.LocalStorage
	registry *storage.Registry
	cache    *config.Cache
}

func NewStorageHandler(local *storage.LocalStorage, registry *storage.Registry, cache *config.Cache) *StorageHandler {
	return &StorageHandler{local: local, registry: registry, cache: cache}
}

// ServeLocal handles GET /media/*, mounted WITHOUT auth in main.go. The
// media root holds public catalog/marketing assets (banner ads, vendor
// logos, product images) that clients render in <img>/<Image> tags, which
// cannot send an Authorization header — so the route must be public for
// images to load at all. Object keys are unguessable random hex.
//
// IMPORTANT: if private files (e.g. ID documents, KYC uploads) are ever
// stored, they must NOT live under this public route — add a separate
// authenticated route with an ownership check for those, the same way
// order/vendor routes gate access.
func (h *StorageHandler) ServeLocal(c echo.Context) error {
	key := c.Param("*")
	fullPath, err := h.local.ResolveServePath(key)
	if err != nil {
		return apperror.BadRequest("invalid file path")
	}
	if _, err := os.Stat(fullPath); err != nil {
		return apperror.NotFound("file")
	}
	return c.File(fullPath)
}

type uploadResponse struct {
	StorageDriver string `json:"storage_driver"`
	ObjectKey     string `json:"object_key"`
	URL           string `json:"url"`
}

// UploadTest handles POST /api/v1/admin/storage/test-upload (super_admin
// only, wired in main.go): accepts a multipart image file, runs it through
// the §5.9 validation pipeline, and stores it on the currently active
// driver. Exists to prove the storage pipeline end-to-end in Phase 4 ahead
// of any real feature (product images, vendor logos) consuming it in later
// phases.
func (h *StorageHandler) UploadTest(c echo.Context) error {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return apperror.BadRequest("file is required (multipart field \"file\")")
	}
	if storage.IsObviouslyDangerousFilename(fileHeader.Filename) {
		return apperror.Validation("file type not allowed")
	}
	if fileHeader.Size > storage.MaxUploadSizeBytes {
		return apperror.Validation("file exceeds maximum upload size")
	}

	src, err := fileHeader.Open()
	if err != nil {
		return apperror.Internal(err)
	}
	defer src.Close()

	data, err := io.ReadAll(io.LimitReader(src, storage.MaxUploadSizeBytes+1))
	if err != nil {
		return apperror.Internal(err)
	}

	validated, err := storage.ValidateImageUpload(data)
	if err != nil {
		return apperror.Validation(err.Error())
	}

	objectKey, err := storage.RandomObjectKey("test-uploads", validated.Extension)
	if err != nil {
		return apperror.Internal(err)
	}

	ctx := c.Request().Context()
	driverName, driver, resolveErr := h.registry.ResolveActive(ctx, h.cache)
	if resolveErr != nil {
		return apperror.Internal(resolveErr)
	}

	if err := driver.Put(ctx, objectKey, bytes.NewReader(validated.Data), validated.ContentType); err != nil {
		return apperror.Internal(err)
	}

	url, err := driver.URL(ctx, objectKey, 0)
	if err != nil {
		return apperror.Internal(err)
	}

	return c.JSON(http.StatusCreated, uploadResponse{
		StorageDriver: driverName,
		ObjectKey:     objectKey,
		URL:           url,
	})
}
