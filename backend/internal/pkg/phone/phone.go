// Package phone normalizes phone numbers to E.164, with explicit support
// for Lebanese mobile prefixes (blueprint §4.10, §9).
package phone

import (
	"regexp"
	"strings"
)

var digitsOnly = regexp.MustCompile(`[^\d+]`)

// lebaneseMobilePrefixes are the valid Lebanese mobile network prefixes
// (after the country code, before the 6-digit subscriber number): Alfa (3,
// 76, 78, 79) and touch (70, 71, 81).
var lebaneseMobilePrefixes = []string{"3", "70", "71", "76", "78", "79", "81"}

// Normalize converts a raw phone number to E.164 (+<countrycode><number>).
// Accepts already-E.164 numbers, local Lebanese numbers (e.g. "03123456",
// "70123456"), and numbers with a leading "00" international prefix.
// Returns ("", false) if the number cannot be confidently normalized.
func Normalize(raw string) (string, bool) {
	cleaned := digitsOnly.ReplaceAllString(strings.TrimSpace(raw), "")
	if cleaned == "" {
		return "", false
	}

	switch {
	case strings.HasPrefix(cleaned, "+961"):
		return normalizeLebanese(cleaned[4:])
	case strings.HasPrefix(cleaned, "00961"):
		return normalizeLebanese(cleaned[5:])
	case strings.HasPrefix(cleaned, "961") && len(cleaned) >= 10:
		return normalizeLebanese(cleaned[3:])
	case strings.HasPrefix(cleaned, "+"):
		// Already E.164 for a non-Lebanese country code: accept as-is if
		// it has a plausible length, since this platform may expand
		// beyond Lebanon.
		if len(cleaned) >= 8 && len(cleaned) <= 16 {
			return cleaned, true
		}
		return "", false
	default:
		// No country code given: assume a local Lebanese number, dropping
		// a leading trunk "0" if present (e.g. "03123456" -> "3123456").
		return normalizeLebanese(strings.TrimPrefix(cleaned, "0"))
	}
}

// normalizeLebanese validates a Lebanese national number (no country code,
// no leading trunk 0) against known mobile prefixes and returns it as
// E.164.
func normalizeLebanese(national string) (string, bool) {
	if !hasValidLebanesePrefix(national) {
		return "", false
	}
	return "+961" + national, true
}

// Lebanese mobile numbers are 8 digits total (national significant number,
// no trunk 0): a 1-digit prefix "3" + 7-digit subscriber number, or a
// 2-digit prefix (70/71/76/78/79/81) + 6-digit subscriber number.
func hasValidLebanesePrefix(national string) bool {
	for _, prefix := range lebaneseMobilePrefixes {
		if strings.HasPrefix(national, prefix) && len(national) == 8 {
			return true
		}
	}
	return false
}
