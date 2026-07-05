CREATE TYPE vendor_application_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE vendor_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status vendor_application_status NOT NULL DEFAULT 'pending',
    business_name_i18n JSONB NOT NULL,
    category TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    contact_first_name TEXT NOT NULL,
    contact_last_name TEXT NOT NULL,
    address TEXT,
    timezone TEXT NOT NULL,
    location GEOGRAPHY(POINT,4326) NOT NULL,
    notes TEXT,
    reject_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_vendor_id UUID REFERENCES vendors(id),
    created_user_id UUID REFERENCES users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_applications_status ON vendor_applications (status, submitted_at);
