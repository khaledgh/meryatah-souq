import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Phone, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '../../components/ui/button'
import { TextInput } from '../../components/ui/input'
import { toApiError } from '../../lib/api-client'
import { useAuth } from './auth-context'

const loginSchema = z.object({
  phone: z.string().min(6, 'Phone number is required'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setIsSubmitting(true)
    try {
      await login(values.phone, values.password)
      await navigate('/', { replace: true })
    } catch (err) {
      const apiErr = toApiError(err)
      setServerError(apiErr.user_message)
    } finally {
      setIsSubmitting(false)
    }
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 dark:bg-gray-950">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(147_51_234/0.12),transparent_45%),radial-gradient(circle_at_80%_80%,rgb(147_51_234/0.10),transparent_45%)]"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('auth.loginTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('app.name')}</p>
          </div>
        </div>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
          <TextInput
            id="phone"
            type="tel"
            autoComplete="tel"
            label={t('auth.phoneLabel')}
            icon={<Phone className="size-4" aria-hidden="true" />}
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            label={t('auth.passwordLabel')}
            icon={<Lock className="size-4" aria-hidden="true" />}
            error={errors.password?.message}
            {...register('password')}
          />
          {serverError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {serverError}
            </p>
          ) : null}
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {t('auth.loginButton')}
          </Button>
        </form>
      </div>
    </div>
  )
}
