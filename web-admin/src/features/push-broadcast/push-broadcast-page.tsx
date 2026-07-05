import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Card, CardBody } from '../../components/ui/card'
import { Select, Textarea, TextInput } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { apiClient, toApiError } from '../../lib/api-client'

type Audience = '' | 'user' | 'vendor' | 'driver'

// Blueprint §11.A14: Push Broadcast — audience (role/all), title/body,
// send. Per-locale text and scheduling are deferred: the backend sends a
// single title/body immediately (see BroadcastToAudience's doc comment).
export function PushBroadcastPage() {
  const { t } = useTranslation()
  const [audience, setAudience] = useState<Audience>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [lastResult, setLastResult] = useState<number | null>(null)

  const send = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ data: { recipients: number } }>('/admin/push-broadcast', {
        role: audience || undefined,
        title,
        body,
      })
      return response.data.data.recipients
    },
    onSuccess: (recipients) => {
      setLastResult(recipients)
      setTitle('')
      setBody('')
    },
  })

  return (
    <div className="max-w-lg">
      <PageHeader title={t('nav.pushBroadcast')} description={t('pushBroadcast.description')} />
      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send.mutate()
            }}
            className="flex flex-col gap-4"
          >
            <Select
              label={t('pushBroadcast.audience')}
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as Audience)
              }}
            >
              <option value="">{t('pushBroadcast.allUsers')}</option>
              <option value="user">{t('pushBroadcast.users')}</option>
              <option value="vendor">{t('pushBroadcast.vendors')}</option>
              <option value="driver">{t('pushBroadcast.drivers')}</option>
            </Select>
            <TextInput
              label={t('pushBroadcast.title')}
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
              }}
            />
            <Textarea
              label={t('pushBroadcast.body')}
              required
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
              }}
              rows={4}
            />
            <Button type="submit" isLoading={send.isPending}>
              <Send className="size-4" aria-hidden="true" />
              {t('pushBroadcast.send')}
            </Button>
            {send.isError ? <p className="text-sm text-red-600 dark:text-red-400">{toApiError(send.error).user_message}</p> : null}
            {lastResult !== null ? (
              <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-4" aria-hidden="true" /> {t('pushBroadcast.sentResult', { count: lastResult })}
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
