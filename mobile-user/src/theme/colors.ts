// Canonical color tokens for the app — single source of truth, mirroring
// tailwind.config.js's `brand` scale so NativeWind classes (bg-brand-500,
// text-brand-600, ...) and any plain-JS color prop (ActivityIndicator tint,
// icon color, RefreshControl) always agree. Import `brand`/semantic tokens
// here instead of hardcoding hex literals in screens.
export const brand = {
  50: '#fffdf0',
  100: '#fff9c4',
  200: '#fff59d',
  300: '#fff176',
  400: '#ffee58',
  500: '#ffd300', // Vibrant golden yellow
  600: '#ffc20e', // Primary brand accent yellow
  700: '#e0a800',
  800: '#b8860b',
  900: '#8b6508',
  950: '#4a3500',
}

export const gray = {
  50: '#F9FAFB',
  100: '#F3F4F6',
  200: '#E5E7EB',
  300: '#D1D5DB',
  400: '#9CA3AF',
  500: '#6B7280',
  600: '#4B5563',
  700: '#374151',
  800: '#1F2937',
  950: '#030712',
}

// Semantic tokens used across screens for things that aren't the primary
// accent (success/open badges, errors, warnings). Kept separate from
// `brand` so a future per-category accent swap never accidentally recolors
// status indicators.
export const semantic = {
  success: '#16A34A',
  successLight: '#DCFCE7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
}

// The app's default accent — used wherever a screen isn't inside a
// category section (theme-context.tsx overrides this per store category).
export const defaultAccent = brand[600]

export const colors = { brand, gray, ...semantic, primary: defaultAccent, white: '#FFFFFF', black: '#000000' }
