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
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#9ca3af',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#252b44',
  900: '#1e2235',
  950: '#0f111a',
}

// Semantic tokens used across screens for things that aren't the primary
// accent (success/online badges, errors, warnings).
export const semantic = {
  success: '#16A34A',
  successLight: '#DCFCE7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
}

export const defaultAccent = brand[600]

export const colors = { brand, gray, ...semantic, primary: defaultAccent, white: '#FFFFFF', black: '#000000' }
