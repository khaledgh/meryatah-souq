import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { TextInput } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/data-table'
import { ErrorState, LoadingState } from '../../components/query-state'
import { PageHeader } from '../../components/ui/page-header'
import type { AuditLogEntry } from '../../schemas/audit-log'
import { useAuditLog, type AuditLogFilters } from './use-audit-log'

// Blueprint §11.A15: Audit Log — filterable table (actor, action, entity,
// ip, time), read-only. Export is deferred: no backend export endpoint
// exists yet.
export function AuditLogPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const { data, isLoading, isError, error, refetch } = useAuditLog(filters)

  const columns: Column<AuditLogEntry>[] = [
    { key: 'time', header: t('auditLog.time'), render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'actor', header: t('auditLog.actor'), render: (r) => (r.actor_id ? <span className="font-mono text-xs">{r.actor_id}</span> : '—') },
    { key: 'role', header: t('auditLog.role'), render: (r) => (r.actor_role ? <Badge variant="brand">{r.actor_role}</Badge> : '—') },
    { key: 'action', header: t('auditLog.action'), render: (r) => <span className="font-mono text-xs">{r.action}</span> },
    { key: 'entity', header: t('auditLog.entity'), render: (r) => `${r.entity}${r.entity_id ? ` (${r.entity_id})` : ''}` },
    { key: 'ip', header: t('auditLog.ip'), render: (r) => r.ip ?? '—' },
  ]

  return (
    <div>
      <PageHeader title={t('nav.auditLog')} />
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="w-48">
          <TextInput
            label={t('auditLog.action')}
            placeholder={t('auditLog.actionPlaceholder')}
            value={filters.action ?? ''}
            onChange={(e) => {
              setFilters((f) => ({ ...f, action: e.target.value || undefined }))
            }}
          />
        </div>
        <div className="w-48">
          <TextInput
            label={t('auditLog.entity')}
            placeholder={t('auditLog.entityPlaceholder')}
            value={filters.entity ?? ''}
            onChange={(e) => {
              setFilters((f) => ({ ...f, entity: e.target.value || undefined }))
            }}
          />
        </div>
        <div className="w-64">
          <TextInput
            label={t('auditLog.actorId')}
            value={filters.actor_id ?? ''}
            onChange={(e) => {
              setFilters((f) => ({ ...f, actor_id: e.target.value || undefined }))
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={data?.data ?? []} rowKey={(r) => r.id} />
          {data && data.total > data.data.length ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t('auditLog.showingCount', { shown: data.data.length, total: data.total })}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
