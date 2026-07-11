import { brand } from './colors'

// Mirrors the backend's store_categories.template_kind enum
// (backend/migrations/000009_marketplace_taxonomy.up.sql). Drives which page
// template a marketplace section renders with on mobile.
export type TemplateKind = 'food' | 'electronics' | 'market' | 'generic'

export interface TemplateStyle {
  accentColor: string
  // Loose descriptor consumed by the template components (Phase F4) to pick
  // their layout — not a strict union since new list styles may be added
  // without touching this config file.
  listStyle: 'menu-list' | 'spec-grid' | 'weight-grid' | 'card-grid'
}

// Fallback accents per template kind, used when a store category has no
// admin-set accent_color. "generic" always falls back to the app default.
const templateKinds: Record<TemplateKind, TemplateStyle> = {
  food: { accentColor: '#ffc20e', listStyle: 'menu-list' },    // golden yellow, matches the app brand
  electronics: { accentColor: '#2563eb', listStyle: 'spec-grid' }, // cool blue, tech feel
  market: { accentColor: '#16a34a', listStyle: 'weight-grid' }, // fresh green, produce feel
  generic: { accentColor: brand[600], listStyle: 'card-grid' },
}

export function templateStyleFor(kind: TemplateKind | string | undefined): TemplateStyle {
  if (kind && kind in templateKinds) {
    return templateKinds[kind as TemplateKind]
  }
  return templateKinds.generic
}
