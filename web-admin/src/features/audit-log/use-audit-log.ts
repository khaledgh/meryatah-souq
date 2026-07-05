import { useQuery } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { auditLogPageSchema } from '../../schemas/audit-log'

export interface AuditLogFilters {
  actor_id?: string
  action?: string
  entity?: string
}

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: async () => {
      const response = await apiClient.get('/admin/audit-log', { params: filters })
      return auditLogPageSchema.parse(response.data)
    },
  })
}
