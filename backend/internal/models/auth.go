package models

import "time"

type UserRole string

const (
	RoleUser       UserRole = "user"
	RoleVendor     UserRole = "vendor"
	RoleDriver     UserRole = "driver"
	RoleSuperAdmin UserRole = "super_admin"
)

type User struct {
	ID              string     `gorm:"column:id;primaryKey" json:"id"`
	Phone           string     `gorm:"column:phone;not null" json:"phone"`
	PhoneVerified   bool       `gorm:"column:phone_verified;not null" json:"phone_verified"`
	FirstName       *string    `gorm:"column:first_name" json:"first_name,omitempty"`
	LastName        *string    `gorm:"column:last_name" json:"last_name,omitempty"`
	PasswordHash    *string    `gorm:"column:password_hash" json:"-"`
	Role            UserRole   `gorm:"column:role;not null" json:"role"`
	PreferredLocale *string    `gorm:"column:preferred_locale" json:"preferred_locale,omitempty"`
	IsActive        bool       `gorm:"column:is_active;not null" json:"is_active"`
	IsOnline        bool       `gorm:"column:is_online;not null" json:"is_online"`
	FailedLogins    int        `gorm:"column:failed_logins;not null" json:"-"`
	LockedUntil     *time.Time `gorm:"column:locked_until" json:"-"`
	CreatedAt       time.Time  `gorm:"column:created_at;not null" json:"created_at"`
	UpdatedAt       time.Time  `gorm:"column:updated_at;not null" json:"updated_at"`
}

func (User) TableName() string { return "users" }

// OTPChallenge tracks challenge metadata for rate-limiting/audit purposes.
// The OTP code itself is never persisted in Postgres — only its hash lives
// in Redis with a TTL matching otp_ttl_seconds (blueprint §5.2, §9), so a
// stolen DB backup can never reveal live codes.
type OTPChallenge struct {
	ID        string    `gorm:"column:id;primaryKey" json:"id"`
	Phone     string    `gorm:"column:phone;not null" json:"phone"`
	Provider  string    `gorm:"column:provider;not null" json:"provider"`
	Consumed  bool      `gorm:"column:consumed;not null" json:"consumed"`
	Attempts  int       `gorm:"column:attempts;not null" json:"-"`
	CreatedAt time.Time `gorm:"column:created_at;not null" json:"created_at"`
	ExpiresAt time.Time `gorm:"column:expires_at;not null" json:"expires_at"`
}

func (OTPChallenge) TableName() string { return "otp_challenges" }

type RefreshToken struct {
	ID         string     `gorm:"column:id;primaryKey" json:"id"`
	UserID     string     `gorm:"column:user_id;not null" json:"user_id"`
	TokenHash  string     `gorm:"column:token_hash;not null" json:"-"`
	ExpiresAt  time.Time  `gorm:"column:expires_at;not null" json:"expires_at"`
	RevokedAt  *time.Time `gorm:"column:revoked_at" json:"revoked_at,omitempty"`
	ReplacedBy *string    `gorm:"column:replaced_by" json:"replaced_by,omitempty"`
	CreatedIP  *string    `gorm:"column:created_ip" json:"-"`
	UserAgent  *string    `gorm:"column:user_agent" json:"-"`
	CreatedAt  time.Time  `gorm:"column:created_at;not null" json:"created_at"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

type PushToken struct {
	ID         string    `gorm:"column:id;primaryKey" json:"id"`
	UserID     string    `gorm:"column:user_id;not null" json:"user_id"`
	PlayerID   string    `gorm:"column:player_id;not null" json:"player_id"`
	Role       UserRole  `gorm:"column:role;not null" json:"role"`
	Platform   *string   `gorm:"column:platform" json:"platform,omitempty"`
	LastSeenAt time.Time `gorm:"column:last_seen_at;not null" json:"last_seen_at"`
}

func (PushToken) TableName() string { return "push_tokens" }

type AuditLog struct {
	ID        string    `gorm:"column:id;primaryKey" json:"id"`
	ActorID   *string   `gorm:"column:actor_id" json:"actor_id,omitempty"`
	ActorRole *UserRole `gorm:"column:actor_role" json:"actor_role,omitempty"`
	Action    string    `gorm:"column:action;not null" json:"action"`
	Entity    *string   `gorm:"column:entity" json:"entity,omitempty"`
	EntityID  *string   `gorm:"column:entity_id" json:"entity_id,omitempty"`
	IP        *string   `gorm:"column:ip" json:"ip,omitempty"`
	Meta      []byte    `gorm:"column:meta;type:jsonb;not null" json:"meta,omitempty"`
	CreatedAt time.Time `gorm:"column:created_at;not null" json:"created_at"`
}

func (AuditLog) TableName() string { return "audit_logs" }
