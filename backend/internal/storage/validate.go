package storage

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"path/filepath"
	"strings"
)

// MaxUploadSizeBytes caps any single upload (blueprint §5.9).
const MaxUploadSizeBytes = 8 << 20 // 8 MiB

// maxImageDimension caps width/height before a full decode is attempted,
// so a small file that declares an enormous pixel grid (a decompression
// bomb) is rejected before image.Decode allocates memory proportional to
// width*height rather than to the compressed byte size.
const maxImageDimension = 8192

// allowedImageTypes maps an allowed MIME type (as sniffed from content, not
// trusted from the client) to its canonical file extension. Only formats
// the standard library can both decode and re-encode are accepted, since
// re-encoding is how EXIF/metadata is stripped (§5.9) — there is no
// dependency-free WebP encoder, so WebP is not accepted. No executables,
// no SVG (which can carry embedded scripts).
var allowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
}

// ValidatedUpload is the result of validating + re-encoding raw upload
// bytes: safe to pass to Storage.Put using RandomObjectKey.
type ValidatedUpload struct {
	Data        []byte
	ContentType string
	Extension   string
}

// ValidateImageUpload enforces the §5.9 pipeline: size cap, MIME sniffed
// from magic bytes (never trusting the client's declared Content-Type or
// filename extension), restriction to a small re-encodable image
// allowlist, and full decode+re-encode — which strips all EXIF/metadata
// (GPS tags, camera info, embedded thumbnails, comments) since the encoder
// only ever writes back the decoded pixel grid.
func ValidateImageUpload(data []byte) (*ValidatedUpload, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("storage: empty upload")
	}
	if len(data) > MaxUploadSizeBytes {
		return nil, fmt.Errorf("storage: upload exceeds max size of %d bytes", MaxUploadSizeBytes)
	}

	sniffed := http.DetectContentType(data)
	ext, ok := allowedImageTypes[sniffed]
	if !ok {
		return nil, fmt.Errorf("storage: unsupported or unrecognized file type %q", sniffed)
	}

	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("storage: read image dimensions (possibly corrupt or a disguised non-image file): %w", err)
	}
	if cfg.Width > maxImageDimension || cfg.Height > maxImageDimension {
		return nil, fmt.Errorf("storage: image dimensions %dx%d exceed the %dpx limit", cfg.Width, cfg.Height, maxImageDimension)
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("storage: decode image (possibly corrupt or a disguised non-image file): %w", err)
	}

	var out bytes.Buffer
	switch sniffed {
	case "image/jpeg":
		if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 90}); err != nil {
			return nil, fmt.Errorf("storage: re-encode jpeg: %w", err)
		}
	case "image/png":
		if err := png.Encode(&out, img); err != nil {
			return nil, fmt.Errorf("storage: re-encode png: %w", err)
		}
	}

	return &ValidatedUpload{Data: out.Bytes(), ContentType: sniffed, Extension: ext}, nil
}

// RandomObjectKey generates an unpredictable object key under the given
// prefix (e.g. "products/", "vendors/logos/") — never derived from the
// client-supplied filename, per §5.9.
func RandomObjectKey(prefix, extension string) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("storage: generate random key: %w", err)
	}
	name := hex.EncodeToString(buf) + extension
	return strings.TrimSuffix(prefix, "/") + "/" + name, nil
}

// rejectedExtensions is a defense-in-depth denylist checked against any
// client-declared filename purely for early/cheap rejection — actual
// acceptance is decided by ValidateImageUpload's magic-byte sniff plus
// successful decode, not by extension, since extensions are trivially
// spoofable.
var rejectedExtensions = map[string]struct{}{
	".exe": {}, ".sh": {}, ".bat": {}, ".cmd": {}, ".php": {}, ".svg": {},
	".html": {}, ".htm": {}, ".js": {},
}

// IsObviouslyDangerousFilename is an early, cheap rejection for clearly
// malicious filenames before spending time reading the body — not a
// substitute for ValidateImageUpload's content sniffing.
func IsObviouslyDangerousFilename(filename string) bool {
	_, dangerous := rejectedExtensions[strings.ToLower(filepath.Ext(filename))]
	return dangerous
}
