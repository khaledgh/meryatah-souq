import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { defaultAccent } from './colors'
import { templateStyleFor, type TemplateKind } from './template-kinds'

interface ThemeContextValue {
  accentColor: string
  templateKind: TemplateKind
  listStyle: ReturnType<typeof templateStyleFor>['listStyle']
}

const defaultTheme: ThemeContextValue = {
  accentColor: defaultAccent,
  templateKind: 'generic',
  listStyle: 'card-grid',
}

const ThemeContext = createContext<ThemeContextValue>(defaultTheme)

// Wraps a marketplace section (Phase F3's section-landing screen, and the
// vendor/product screens within it) so every descendant reads the same
// accent + template without prop-drilling. Outside any section, useTheme()
// returns the app's default accent — screens work unchanged.
export function ThemeProvider({
  templateKind,
  accentColor,
  children,
}: {
  templateKind?: TemplateKind | string | null
  accentColor?: string | null
  children: ReactNode
}) {
  const value = useMemo<ThemeContextValue>(() => {
    const style = templateStyleFor(templateKind ?? undefined)
    return {
      accentColor: accentColor ?? style.accentColor,
      templateKind: (templateKind as TemplateKind) ?? 'generic',
      listStyle: style.listStyle,
    }
  }, [templateKind, accentColor])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
