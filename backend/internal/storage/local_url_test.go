package storage

import (
	"context"
	"testing"
)

// TestLocalStorageURL locks in the media URL shape: exactly one "/media"
// segment regardless of whether MEDIA_BASE_URL is set to the bare origin or
// (defensively) with a trailing "/media". Regression guard for the
// "/media/media/..." double-prefix bug.
func TestLocalStorageURL(t *testing.T) {
	tests := []struct {
		name         string
		mediaBaseURL string // already normalized (as config.normalizeMediaBaseURL would produce)
		key          string
		want         string
	}{
		{
			name:         "absolute origin",
			mediaBaseURL: "https://souq-api.linksbridge.top",
			key:          "banner-ads/abc.png",
			want:         "https://souq-api.linksbridge.top/media/banner-ads/abc.png",
		},
		{
			name:         "empty base -> relative",
			mediaBaseURL: "",
			key:          "banner-ads/abc.png",
			want:         "/media/banner-ads/abc.png",
		},
		{
			name:         "cdn host",
			mediaBaseURL: "https://media.example.com",
			key:          "vendor-logos/x.jpg",
			want:         "https://media.example.com/media/vendor-logos/x.jpg",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := &LocalStorage{urlPrefix: "/media", mediaBaseURL: tc.mediaBaseURL}
			got, err := s.URL(context.Background(), tc.key, 0)
			if err != nil {
				t.Fatalf("URL returned error: %v", err)
			}
			if got != tc.want {
				t.Errorf("URL(%q) with base %q = %q, want %q", tc.key, tc.mediaBaseURL, got, tc.want)
			}
		})
	}
}
