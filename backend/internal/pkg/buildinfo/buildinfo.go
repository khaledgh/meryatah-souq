// Package buildinfo exposes the running binary's version so a deployed
// process can be matched back to the exact source it was built from — the
// question "is the server actually running my latest build?" should be
// answerable from the startup log, not guesswork.
package buildinfo

import (
	"runtime"
	"runtime/debug"
)

// Version and BuildTime can be stamped at build time via ldflags, e.g.
//
//	go build -ldflags "-X meryata-souq/backend/internal/pkg/buildinfo.Version=$(git rev-parse --short HEAD) -X meryata-souq/backend/internal/pkg/buildinfo.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
//
// When they are NOT stamped (a plain `go build` / `go run`), Version falls
// back to the VCS revision Go embeds automatically for a build inside a git
// repo, so it is still meaningful with zero build flags.
var (
	Version   = ""
	BuildTime = ""
)

// Info is the resolved build identity.
type Info struct {
	Version   string // git commit (short), or "dev" / "unknown"
	BuildTime string // RFC3339 build timestamp, or "" if unknown
	GoVersion string
	Dirty     bool // true if the working tree had uncommitted changes at build time
}

// Get resolves the build info, preferring ldflags values and falling back to
// Go's embedded VCS stamps.
func Get() Info {
	info := Info{
		Version:   Version,
		BuildTime: BuildTime,
		GoVersion: runtime.Version(),
	}

	bi, ok := debug.ReadBuildInfo()
	if !ok {
		if info.Version == "" {
			info.Version = "unknown"
		}
		return info
	}

	for _, s := range bi.Settings {
		switch s.Key {
		case "vcs.revision":
			if info.Version == "" && s.Value != "" {
				// Short form, matching `git rev-parse --short HEAD`.
				if len(s.Value) > 12 {
					info.Version = s.Value[:12]
				} else {
					info.Version = s.Value
				}
			}
		case "vcs.time":
			if info.BuildTime == "" {
				info.BuildTime = s.Value
			}
		case "vcs.modified":
			info.Dirty = s.Value == "true"
		}
	}

	if info.Version == "" {
		info.Version = "dev"
	}
	return info
}

// String renders the build identity for a single log line, e.g.
// "version=1a2b3c4d5e6f (dirty) built=2026-07-11T20:00:00Z go=go1.24.0".
func (i Info) String() string {
	s := "version=" + i.Version
	if i.Dirty {
		s += " (dirty)"
	}
	if i.BuildTime != "" {
		s += " built=" + i.BuildTime
	}
	s += " go=" + i.GoVersion
	return s
}
