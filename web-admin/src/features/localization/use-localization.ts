import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { localeListSchema, missingKeyListSchema, uiTranslationListSchema } from '../../schemas/localization'

const LOCALES_KEY = ['locales'] as const
const TRANSLATIONS_KEY = ['translations'] as const
const MISSING_KEYS_KEY = ['translations-missing'] as const

export function useLocales() {
  return useQuery({
    queryKey: LOCALES_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/locales')
      return localeListSchema.parse(response.data).data ?? []
    },
  })
}

export function useCreateLocale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { code: string; name: string; is_rtl: boolean; sort_order: number }) => {
      await apiClient.post('/admin/locales', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCALES_KEY })
    },
  })
}

export function useSetLocaleActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, active }: { code: string; active: boolean }) => {
      await apiClient.put(`/admin/locales/${code}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCALES_KEY })
    },
  })
}

export function useSetDefaultLocale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      await apiClient.put(`/admin/locales/${code}/default`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCALES_KEY })
    },
  })
}

export function useSetLocaleRTL() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, isRtl }: { code: string; isRtl: boolean }) => {
      await apiClient.put(`/admin/locales/${code}/rtl`, { is_rtl: isRtl })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCALES_KEY })
    },
  })
}

export function useTranslations(locale: string | undefined) {
  return useQuery({
    queryKey: [...TRANSLATIONS_KEY, locale],
    queryFn: async () => {
      const response = await apiClient.get('/admin/translations', { params: locale ? { locale } : {} })
      return uiTranslationListSchema.parse(response.data).data ?? []
    },
    enabled: locale !== undefined,
  })
}

export function useUpsertTranslation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { locale: string; namespace: string; key: string; value: string }) => {
      await apiClient.put('/admin/translations', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRANSLATIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: MISSING_KEYS_KEY })
    },
  })
}

export function useMissingKeyReport() {
  return useQuery({
    queryKey: MISSING_KEYS_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/admin/translations/missing')
      return missingKeyListSchema.parse(response.data).data ?? []
    },
  })
}
