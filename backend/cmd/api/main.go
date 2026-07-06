// Command api is the Meryata Souq backend entrypoint: a single modular Go
// monolith serving a versioned REST API (blueprint §0, §16).
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // embed the IANA tz database in the binary: deployment targets (minimal containers, stripped hosts) may not ship a system zoneinfo DB, but vendor timezone evaluation (services.VendorHoursService.IsOpenNow) requires time.LoadLocation to always succeed

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/currency"
	"meryata-souq/backend/internal/handlers"
	"meryata-souq/backend/internal/i18n"
	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/onesignal"
	"meryata-souq/backend/internal/pkg/otp"
	"meryata-souq/backend/internal/services"
	"meryata-souq/backend/internal/storage"
	"meryata-souq/backend/internal/ws"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := config.NewDatabase(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer sqlDB.Close()

	if err := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return config.EnsurePostGIS(ctx, db)
	}(); err != nil {
		log.Fatalf("postgis: %v", err)
	}

	redisClient, err := config.NewRedis(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer redisClient.Close()

	bootCtx, bootCancel := context.WithTimeout(context.Background(), 10*time.Second)
	cache, err := config.NewCache(bootCtx, db, redisClient)
	bootCancel()
	if err != nil {
		log.Fatalf("config cache: %v", err)
	}

	cacheCtx, cacheCancel := context.WithCancel(context.Background())
	defer cacheCancel()
	cache.Subscribe(cacheCtx)

	i18nService := i18n.NewService(db, cache)
	settingsService := services.NewSettingsService(db, cache)

	otpRegistry := otp.NewRegistry(
		otp.NewSMSProvider(cfg.SMSAPIKey),
		otp.NewWhatsAppProvider(cfg.WhatsAppAPIKey),
	)
	otpService := services.NewOTPService(db, redisClient, cache, otpRegistry)
	auditService := services.NewAuditService(db)
	authService := services.NewAuthService(db, cfg, cache, otpService, auditService)

	if err := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return services.BootstrapSuperAdmin(ctx, db, cfg.SeedAdminPhone, cfg.SeedAdminPassword)
	}(); err != nil {
		log.Fatalf("bootstrap: %v", err)
	}

	localStorage, err := storage.NewLocalStorage(cfg.MediaLocalDir, "/media", cfg.MediaBaseURL)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	var s3Storage *storage.S3Storage
	if cfg.AWSS3Bucket != "" {
		s3Ctx, s3Cancel := context.WithTimeout(context.Background(), 10*time.Second)
		s3Storage, err = storage.NewS3Storage(s3Ctx, cfg.AWSRegion, cfg.AWSS3Bucket, cfg.AWSAccessKeyID, cfg.AWSSecretAccessKey)
		s3Cancel()
		if err != nil {
			log.Fatalf("storage: %v", err)
		}
	}
	storageRegistry := storage.NewRegistry(localStorage, s3Storage)

	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = appmw.ErrorHandler
	e.Use(echomw.Recover())
	e.Use(appmw.SecurityHeaders())
	// Global cap slightly above the largest legitimate upload
	// (storage.MaxUploadSizeBytes) so Echo rejects oversized request bodies
	// before any handler-level check runs, preventing large bodies from
	// being spooled to disk/memory during multipart parsing.
	e.Use(echomw.BodyLimit(fmt.Sprintf("%dK", (storage.MaxUploadSizeBytes/1024)+512)))
	if len(cfg.CORSOrigins) > 0 {
		e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
			AllowOrigins: cfg.CORSOrigins,
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete},
		}))
	}

	healthHandler := handlers.NewHealthHandler(db)
	e.GET("/health", func(c echo.Context) error {
		return healthHandler.Check(c, func() error {
			pingCtx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
			defer cancel()
			return config.PingRedis(pingCtx, redisClient)
		})
	})

	i18nHandler := handlers.NewI18nHandler(i18nService)
	v1 := e.Group("/api/v1")
	v1.GET("/i18n/:locale", i18nHandler.GetTranslations)
	v1.GET("/locales", i18nHandler.ListLocales)

	authHandler := handlers.NewAuthHandler(otpService, authService)
	v1.POST("/auth/request-otp", authHandler.RequestOTP)
	v1.POST("/auth/verify-otp", authHandler.VerifyOTP)
	v1.POST("/auth/complete-registration", authHandler.CompleteRegistration)
	v1.POST("/auth/login-password", authHandler.LoginPassword)
	v1.GET("/auth/vendor-login-method", authHandler.VendorLoginMethod)
	v1.POST("/auth/refresh", authHandler.Refresh)
	v1.POST("/auth/logout", authHandler.Logout)

	requireAuth := appmw.RequireAuth([]byte(cfg.JWTSecret))
	requireSuperAdmin := appmw.RequireRole(string(models.RoleSuperAdmin))

	settingsHandler := handlers.NewSettingsHandler(settingsService)
	admin := v1.Group("/admin", requireAuth, requireSuperAdmin)
	admin.GET("/settings", settingsHandler.ListAll)
	admin.PUT("/config/:key", settingsHandler.SetAppConfig)
	admin.PUT("/feature-flags/:key", settingsHandler.SetFeatureFlag)
	admin.PUT("/exchange-rates/:code", settingsHandler.SetExchangeRate)

	storageHandler := handlers.NewStorageHandler(localStorage, storageRegistry, cache)
	admin.POST("/storage/test-upload", storageHandler.UploadTest)
	// Public: media holds public catalog/marketing assets (banner ads, vendor
	// logos, product images) that clients render in <img>/<Image> tags, which
	// cannot send an Authorization header. Object keys are unguessable random
	// hex. If private files (e.g. ID documents) are ever stored, they must go
	// through a SEPARATE authenticated route with an ownership check, not this
	// one — see the note on StorageHandler.ServeLocal.
	e.GET("/media/*", storageHandler.ServeLocal)

	vendorService := services.NewVendorService(db)
	vendorHandler := handlers.NewVendorHandler(vendorService)
	requireVendorOwner := appmw.RequireVendorOwnership(vendorService, "id")

	v1.GET("/vendors/nearby", vendorHandler.Nearby)
	v1.GET("/vendors/:id", vendorHandler.Get)
	admin.POST("/vendors", vendorHandler.Create)
	admin.PUT("/vendors/:id/commission", vendorHandler.SetCommission)
	admin.PUT("/vendors/:id/scheduling-allowed", vendorHandler.GrantScheduling)
	admin.PUT("/vendors/:id/active", vendorHandler.SetActive)

	vendorApplicationService := services.NewVendorApplicationService(db, auditService, otpService)
	vendorApplicationHandler := handlers.NewVendorApplicationHandler(vendorApplicationService)
	limitVendorApplications := appmw.RateLimitByIP(redisClient, "ratelimit:vendor-application:", 10, time.Hour)
	v1.POST("/vendor-applications", vendorApplicationHandler.Submit, limitVendorApplications)
	admin.GET("/vendor-applications", vendorApplicationHandler.List)
	admin.POST("/vendor-applications/:id/approve", vendorApplicationHandler.Approve)
	admin.POST("/vendor-applications/:id/reject", vendorApplicationHandler.Reject)

	// /vendor/me resolves the caller's own vendor and so takes no :id — it
	// can't live in the vendorOwn group (whose ownership middleware reads
	// :id from the path). It's guarded by auth + vendor role instead.
	requireVendorRole := appmw.RequireRole(string(models.RoleVendor))
	v1.GET("/vendor/me", vendorHandler.Me, requireAuth, requireVendorRole)

	vendorOwn := v1.Group("/vendor", requireAuth, requireVendorOwner)
	vendorOwn.PATCH("/:id/profile", vendorHandler.Update)
	vendorOwn.PUT("/:id/scheduling-enabled", vendorHandler.SetSchedulingEnabled)

	hoursService := services.NewVendorHoursService(db)
	hoursHandler := handlers.NewVendorHoursHandler(hoursService)
	v1.GET("/vendors/:id/open-status", hoursHandler.OpenStatus)
	v1.GET("/vendors/:id/hours", hoursHandler.ListWeeklyHours)
	vendorOwn.PUT("/:id/hours", hoursHandler.SetWeeklyHours)
	vendorOwn.GET("/:id/hours/overrides", hoursHandler.ListOverrides)
	vendorOwn.POST("/:id/hours/overrides", hoursHandler.UpsertOverride)
	vendorOwn.DELETE("/:id/hours/overrides/:overrideId", hoursHandler.DeleteOverride)

	currencyService := currency.NewService(cache)

	categoryService := services.NewCategoryService(db)
	categoryHandler := handlers.NewCategoryHandler(categoryService)
	v1.GET("/vendors/:id/categories", categoryHandler.List)
	vendorOwn.POST("/:id/categories", categoryHandler.Create)
	vendorOwn.PATCH("/:id/categories/:categoryId", categoryHandler.Update)
	vendorOwn.DELETE("/:id/categories/:categoryId", categoryHandler.Delete)

	productService := services.NewProductService(db, currencyService, storageRegistry)
	productImageService := services.NewProductImageService(db, cache, storageRegistry)
	productHandler := handlers.NewProductHandler(productService, productImageService)
	v1.GET("/vendors/:id/products", productHandler.List)
	v1.GET("/products/:productId", productHandler.Get)
	vendorOwn.POST("/:id/products", productHandler.Create)
	vendorOwn.PATCH("/:id/products/:productId", productHandler.Update)
	vendorOwn.DELETE("/:id/products/:productId", productHandler.Delete)
	vendorOwn.POST("/:id/products/:productId/images", productHandler.AddImage)
	vendorOwn.DELETE("/:id/products/:productId/images/:imageId", productHandler.RemoveImage)
	vendorOwn.PUT("/:id/products/:productId/images/order", productHandler.ReorderImages)

	oneSignalClient := onesignal.NewClient(cfg.OneSignalAppID, cfg.OneSignalAPIKey)
	notificationService := services.NewNotificationService(db, oneSignalClient, i18nService)

	schedulingService := services.NewSchedulingService(db, hoursService)
	couponService := services.NewCouponService(db)
	orderService := services.NewOrderService(db, redisClient, cache, currencyService, hoursService, schedulingService, notificationService, couponService)
	orderHandler := handlers.NewOrderHandler(orderService, schedulingService)

	v1.GET("/vendors/:id/scheduling/slots", orderHandler.AvailableSlots)

	requireUser := appmw.RequireRole(string(models.RoleUser))
	userGroup := v1.Group("/user", requireAuth, requireUser)
	userGroup.POST("/orders", orderHandler.PlaceOrder)
	userGroup.GET("/orders", orderHandler.ListMyOrders)
	userGroup.GET("/orders/:orderId", orderHandler.GetMyOrder)

	vendorOwn.GET("/:id/orders", orderHandler.ListVendorOrders)
	vendorOwn.PUT("/:id/orders/:orderId/status", orderHandler.UpdateOrderStatus)

	vendorStatsService := services.NewVendorStatsService(db, currencyService)
	vendorStatsHandler := handlers.NewVendorStatsHandler(vendorStatsService)
	vendorOwn.GET("/:id/dashboard", vendorStatsHandler.Dashboard)
	vendorOwn.GET("/:id/earnings", vendorStatsHandler.Earnings)

	requireDriver := appmw.RequireRole(string(models.RoleDriver))
	driverGroup := v1.Group("/driver", requireAuth, requireDriver)
	driverGroup.POST("/orders/:orderId/accept", orderHandler.AcceptAsDriver)
	driverGroup.PUT("/orders/:orderId/status", orderHandler.UpdateStatusAsDriver)

	notificationHandler := handlers.NewNotificationHandler(notificationService)
	v1.POST("/push-tokens", notificationHandler.RegisterPushToken, requireAuth)

	hub := ws.NewHub(redisClient)
	hubCtx, hubCancel := context.WithCancel(context.Background())
	defer hubCancel()
	go hub.Run(hubCtx)

	driverLocationService := services.NewDriverLocationService(db)
	wsTicketService := services.NewWSTicketService(redisClient)
	wsHandler := handlers.NewWSHandler(hub, driverLocationService, wsTicketService, cfg.CORSOrigins)
	v1.POST("/ws/ticket", wsHandler.IssueTicket, requireAuth)
	v1.GET("/ws/orders/:orderId/track", wsHandler.TrackOrder)

	bannerAdService := services.NewBannerAdService(db, cache, storageRegistry)
	bannerAdHandler := handlers.NewBannerAdHandler(bannerAdService)
	v1.GET("/banner-ads", bannerAdHandler.ListActive)
	admin.GET("/banner-ads", bannerAdHandler.List)
	admin.POST("/banner-ads", bannerAdHandler.Create)
	admin.PUT("/banner-ads/:id", bannerAdHandler.Update)
	admin.PUT("/banner-ads/:id/active", bannerAdHandler.SetActive)
	admin.DELETE("/banner-ads/:id", bannerAdHandler.Delete)

	couponHandler := handlers.NewCouponHandler(couponService)
	admin.POST("/coupons", couponHandler.Create)
	admin.GET("/coupons", couponHandler.ListGlobal)
	admin.PUT("/coupons/:couponId", couponHandler.UpdateGlobal)
	admin.PUT("/coupons/:couponId/active", couponHandler.SetActiveGlobal)
	admin.DELETE("/coupons/:couponId", couponHandler.DeleteGlobal)
	vendorOwn.POST("/:id/coupons", couponHandler.Create)
	vendorOwn.GET("/:id/coupons", couponHandler.ListForVendor)
	vendorOwn.PUT("/:id/coupons/:couponId/active", couponHandler.SetActiveForVendor)

	ratingService := services.NewRatingService(db)
	ratingHandler := handlers.NewRatingHandler(ratingService)
	userGroup.POST("/orders/:orderId/rating", ratingHandler.Create)
	driverGroup.GET("/ratings", ratingHandler.ListMyRatings)

	adminUserService := services.NewAdminUserService(db)
	adminUserHandler := handlers.NewAdminUserHandler(adminUserService, auditService)
	admin.GET("/users", adminUserHandler.ListUsers)
	admin.POST("/users", adminUserHandler.CreateUser)
	admin.GET("/drivers", adminUserHandler.ListDrivers)
	admin.POST("/drivers", adminUserHandler.CreateDriver)
	admin.PUT("/users/:userId/active", adminUserHandler.SetActive)
	admin.PUT("/users/:userId/password", adminUserHandler.SetPassword)
	admin.POST("/users/:userId/reset-lockout", adminUserHandler.ResetLockout)
	admin.GET("/vendor-owners", adminUserHandler.ListVendorUsers)

	adminOrderHandler := handlers.NewAdminOrderHandler(orderService)
	admin.GET("/orders", adminOrderHandler.ListAll)

	currencyAdminService := services.NewCurrencyAdminService(db, cache)
	currencyAdminHandler := handlers.NewCurrencyAdminHandler(currencyAdminService)
	admin.GET("/currencies", currencyAdminHandler.List)
	admin.POST("/currencies", currencyAdminHandler.Create)
	admin.PUT("/currencies/:code/active", currencyAdminHandler.SetActive)

	auditReadService := services.NewAuditReadService(db)
	auditLogHandler := handlers.NewAuditLogHandler(auditReadService)
	admin.GET("/audit-log", auditLogHandler.List)

	pushBroadcastHandler := handlers.NewPushBroadcastHandler(notificationService)
	admin.POST("/push-broadcast", pushBroadcastHandler.Send)

	localizationAdminService := services.NewLocalizationAdminService(db, cache)
	localizationAdminHandler := handlers.NewLocalizationAdminHandler(localizationAdminService)
	admin.GET("/locales", localizationAdminHandler.ListLocales)
	admin.POST("/locales", localizationAdminHandler.CreateLocale)
	admin.PUT("/locales/:code/active", localizationAdminHandler.SetActive)
	admin.PUT("/locales/:code/default", localizationAdminHandler.SetDefault)
	admin.PUT("/locales/:code/rtl", localizationAdminHandler.SetRTL)
	admin.GET("/translations", localizationAdminHandler.ListTranslations)
	admin.PUT("/translations", localizationAdminHandler.UpsertTranslation)
	admin.GET("/translations/missing", localizationAdminHandler.MissingKeyReport)

	go func() {
		addr := ":" + cfg.HTTPPort
		log.Printf("meryata-souq backend listening on %s (env=%s)", addr, cfg.AppEnv)
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}

	// Close every still-open WebSocket connection rather than leaving them
	// to linger until their TCP socket happens to break on its own —
	// e.Shutdown only stops accepting new HTTP requests, it doesn't touch
	// already-upgraded long-lived connections.
	hub.Shutdown()

	// Drain the notification worker pool so queued/in-flight pushes aren't
	// silently abandoned when the process exits (blueprint §4.8: failures
	// must be logged, never swallowed — including at shutdown).
	notifyShutdownCtx, notifyShutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer notifyShutdownCancel()
	notificationService.Stop(notifyShutdownCtx)
}
