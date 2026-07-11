package services

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// AuditReadService implements the admin-facing audit log view (blueprint
// §11.A15: "filterable audit_logs table (actor, action, entity, ip,
// time)"). Writing audit entries is AuditService's job (Phase 3); this is
// the read side.
type AuditReadService struct {
	db *gorm.DB
}

func NewAuditReadService(db *gorm.DB) *AuditReadService {
	return &AuditReadService{db: db}
}

type AuditLogFilter struct {
	ActorID *string
	Action  *string
	Entity  *string
}

const auditLogListLimit = 200

// AuditLogPage caps at auditLogListLimit rows; Total lets the caller (the
// admin UI) tell an admin their filter matched more rows than are shown,
// rather than silently truncating with no signal.
type AuditLogPage struct {
	Logs  []models.AuditLog `json:"logs"`
	Total int64             `json:"total"`
}

func (s *AuditReadService) List(ctx context.Context, filter AuditLogFilter) (*AuditLogPage, *apperror.AppError) {
	query := s.db.WithContext(ctx).Model(&models.AuditLog{})
	if filter.ActorID != nil {
		query = query.Where("actor_id = ?", *filter.ActorID)
	}
	if filter.Action != nil {
		query = query.Where("action = ?", *filter.Action)
	}
	if filter.Entity != nil {
		query = query.Where("entity = ?", *filter.Entity)
	}

	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("audit_read: count: %w", err))
	}

	logs := make([]models.AuditLog, 0)
	if err := query.Order("created_at DESC").Limit(auditLogListLimit).Find(&logs).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("audit_read: list: %w", err))
	}
	return &AuditLogPage{Logs: logs, Total: total}, nil
}
