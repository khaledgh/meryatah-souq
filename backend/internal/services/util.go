package services

import (
	"encoding/json"

	"github.com/google/uuid"
)

func newUUID() string {
	return uuid.NewString()
}

func unmarshalInt(raw json.RawMessage, out *int) error {
	return json.Unmarshal(raw, out)
}
