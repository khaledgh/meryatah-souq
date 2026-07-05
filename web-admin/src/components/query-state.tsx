import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toApiError } from '../lib/api-client'
import { Button } from './ui/button'

// Standard loading/error/empty presentational states so every page renders
// the same three states consistently (blueprint §13 definition of done:
// "loading/empty/error states" on every §11 page).

export function LoadingState() {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-gray-500 dark:text-gray-400">
      <Loader2 className="size-6 animate-spin text-brand-500" aria-hidden="true" />
      {t('common.loading')}
    </div>
  )
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <Inbox className="size-8 text-gray-300 dark:text-gray-700" aria-hidden="true" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message ?? t('common.empty')}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const apiError = toApiError(error)
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm text-red-600 dark:text-red-400">{apiError.user_message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}
