/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Warm amber/yellow brand palette (replaces the previous purple
        // scale, which no screen actually used — every screen hardcoded
        // emerald literals instead). This is now the single source of truth
        // for the app's accent color; see src/theme/colors.ts for the
        // semantic tokens built on top of it.
        brand: {
          50: '#fffdf0',
          100: '#fff9c4',
          200: '#fff59d',
          300: '#fff176',
          400: '#ffee58',
          500: '#ffd300',
          600: '#ffc20e',
          700: '#e0a800',
          800: '#b8860b',
          900: '#8b6508',
          950: '#4a3500',
        },
        gray: {
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
        },
      },
    },
  },
  plugins: [],
}
