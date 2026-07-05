package models

import (
	"encoding/json"
	"time"
)

type VendorApplicationStatus string

const (
	VendorApplicationPending  VendorApplicationStatus = "pending"
	VendorApplicationApproved VendorApplicationStatus = "approved"
	VendorApplicationRejected VendorApplicationStatus = "rejected"
)

// VendorApplication is a prospective vendor's onboarding request (blueprint
// §11.A5): the contact phone is OTP-verified at submission time (see
// VendorApplicationService.Submit), then a super_admin approves/rejects.
// Approval creates the Vendor + owner User rows and links them back here.
// Location mirrors Vendor's handling — GEOGRAPHY(POINT,4326), read/written
// via raw SQL (see vendor_application_service.go), never a mapped struct
// field.
type VendorApplication struct {
	ID               string                  `gorm:"column:id;primaryKey" json:"id"`
	Status           VendorApplicationStatus `gorm:"column:status;not null" json:"status"`
	BusinessNameI18n json.RawMessage         `gorm:"column:business_name_i18n;type:jsonb;not null" json:"business_name_i18n"`
	Category         string                  `gorm:"column:category;not null" json:"category"`
	ContactPhone     string                  `gorm:"column:contact_phone;not null" json:"contact_phone"`
	ContactFirstName string                  `gorm:"column:contact_first_name;not null" json:"contact_first_name"`
	ContactLastName  string                  `gorm:"column:contact_last_name;not null" json:"contact_last_name"`
	Address          *string                 `gorm:"column:address" json:"address,omitempty"`
	Timezone         string                  `gorm:"column:timezone;not null" json:"timezone"`
	Notes            *string                 `gorm:"column:notes" json:"notes,omitempty"`
	RejectReason     *string                 `gorm:"column:reject_reason" json:"reject_reason,omitempty"`
	ReviewedBy       *string                 `gorm:"column:reviewed_by" json:"reviewed_by,omitempty"`
	ReviewedAt       *time.Time              `gorm:"column:reviewed_at" json:"reviewed_at,omitempty"`
	CreatedVendorID  *string                 `gorm:"column:created_vendor_id" json:"created_vendor_id,omitempty"`
	CreatedUserID    *string                 `gorm:"column:created_user_id" json:"created_user_id,omitempty"`
	SubmittedAt      time.Time               `gorm:"column:submitted_at;not null" json:"submitted_at"`

	// Longitude/Latitude are computed via ST_X/ST_Y in the service layer's
	// raw SQL, same pattern as models.Vendor — see the comment there for why
	// these must NOT carry a gorm:"-" tag.
	Longitude float64 `gorm:"column:longitude" json:"longitude"`
	Latitude  float64 `gorm:"column:latitude" json:"latitude"`
}

func (VendorApplication) TableName() string { return "vendor_applications" }
