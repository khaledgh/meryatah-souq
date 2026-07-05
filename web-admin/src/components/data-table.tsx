import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface Column<T> {
  header: string
  render: (row: T) => ReactNode
  key: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
}

// A minimal, dependency-free table — the admin dashboard's lists are small
// enough (paginated server-side) that a full table library isn't needed.
export function DataTable<T>({ columns, rows, rowKey }: DataTableProps<T>) {
  const { t } = useTranslation()

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 py-16 dark:border-gray-700 dark:bg-gray-900/50">
        <Inbox className="size-8 text-gray-300 dark:text-gray-700" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.empty')}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-card dark:border-gray-800">
      <table className="w-full min-w-max text-start text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-950">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900">
              {columns.map((col) => (
                <td key={col.key} className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
