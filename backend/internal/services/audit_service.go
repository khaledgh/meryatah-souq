package services

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
)

// AuditService records privileged actions to audit_logs (blueprint §5.10,
// §5.11). Writes are best-effort: a failed audit write must never block or
// fail the action it's recording, but is logged loudly since a silent gap
// in the audit trail is itself a security-relevant event.
type AuditService struct {
	db *gorm.DB
}

func NewAuditService(db *gorm.DB) *AuditService {
	return &AuditService{db: db}
}

// Log records an audit entry. actorID/actorRole/entityID may be nil (e.g.
// pre-auth actions). meta must not contain secrets or PII (§5.10).
func (s *AuditService) Log(ctx context.Context, actorID *string, actorRole *models.UserRole, action, entity string, entityID *string, ip string, meta map[string]any) {
	metaJSON := []byte("{}")
	if meta != nil {
		encoded, err := json.Marshal(meta)
		if err != nil {
			log.Printf("audit: failed to marshal meta for action %q: %v", action, err)
		} else {
			metaJSON = encoded
		}
	}

	entry := models.AuditLog{
		ID:        newUUID(),
		ActorID:   actorID,
		ActorRole: actorRole,
		Action:    action,
		Entity:    &entity,
		EntityID:  entityID,
		IP:        &ip,
		Meta:      metaJSON,
		CreatedAt: time.Now(),
	}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		log.Printf("audit: failed to write audit log for action %q: %v", action, err)
	}
}
