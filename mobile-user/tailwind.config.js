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
      },
    },
  },
  plugins: [],
}
