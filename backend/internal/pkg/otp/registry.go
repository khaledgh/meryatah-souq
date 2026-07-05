package otp

import "fmt"

// Registry resolves the active Provider by name at call time (not once at
// boot), so admin changes to app_configs.otp_provider take effect on the
// next OTP send with no restart (blueprint §4.3, §9).
type Registry struct {
	providers map[string]Provider
}

func NewRegistry(providers ...Provider) *Registry {
	m := make(map[string]Provider, len(providers))
	for _, p := range providers {
		m[p.Name()] = p
	}
	return &Registry{providers: m}
}

func (r *Registry) Resolve(name string) (Provider, error) {
	p, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("otp: unknown provider %q", name)
	}
	return p, nil
}
