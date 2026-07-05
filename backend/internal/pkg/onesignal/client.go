// Package onesignal implements a minimal OneSignal REST API client for
// push notification dispatch (blueprint §4.8).
package onesignal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const apiBaseURL = "https://onesignal.com/api/v1/notifications"

// Client sends push notifications via OneSignal's REST API.
type Client struct {
	appID      string
	apiKey     string
	httpClient *http.Client
}

func NewClient(appID, apiKey string) *Client {
	return &Client{
		appID:      appID,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Configured reports whether real credentials are set — callers should
// skip dispatch (and log, not fail) when they aren't, since push is a
// best-effort side channel, not a request-blocking dependency.
func (c *Client) Configured() bool {
	return c.appID != "" && c.apiKey != ""
}

type notificationRequest struct {
	AppID            string            `json:"app_id"`
	IncludePlayerIDs []string          `json:"include_player_ids"`
	Headings         map[string]string `json:"headings,omitempty"`
	Contents         map[string]string `json:"contents"`
}

// Send dispatches a notification to the given OneSignal player IDs. title
// may be empty for platforms/templates that don't use it. Both are already
// localized text, not translation keys — localization happens before this
// call (blueprint §4.8: "payload text localized to recipient
// preferred_locale").
func (c *Client) Send(ctx context.Context, playerIDs []string, title, body string) error {
	if !c.Configured() {
		return fmt.Errorf("onesignal: client not configured (ONESIGNAL_APP_ID/ONESIGNAL_API_KEY unset)")
	}
	if len(playerIDs) == 0 {
		return nil
	}

	req := notificationRequest{
		AppID:            c.appID,
		IncludePlayerIDs: playerIDs,
		Contents:         map[string]string{"en": body},
	}
	if title != "" {
		req.Headings = map[string]string{"en": title}
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("onesignal: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBaseURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("onesignal: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("onesignal: send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("onesignal: unexpected status %d", resp.StatusCode)
	}
	return nil
}
