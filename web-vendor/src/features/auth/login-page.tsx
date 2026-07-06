import { KeyRound, Lock, Phone, Store } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { TextInput } from '../../components/ui/input'
import { toApiError } from '../../lib/api-client'
import { useAuth } from './auth-context'
import { useVendorLoginMethod } from './use-vendor-login-method'

type Step = 'phone' | 'code'

export function LoginPage() {
  const { t } = useTranslation()
  const { requestOtp, verifyOtp, loginWithPassword } = useAuth()
  const navigate = useNavigate()
  const loginMethod = useVendorLoginMethod()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onRequestOtp = async (e: SyntheticEvent) => {
    e.preventDefault()
    setServerError(null)
    setIsSubmitting(true)
    try {
      await requestOtp(phone)
      setStep('code')
    } catch (err) {
      setServerError(toApiError(err).user_message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const onVerifyOtp = async (e: SyntheticEvent) => {
    e.preventDefault()
    setServerError(null)
    setIsSubmitting(true)
    try {
      await verifyOtp(phone, code)
      await navigate('/', { replace: true })
    } catch (err) {
      // Domain errors thrown by verifyOtp carry a stable code we localize;
      // anything else is a transport/API error normalized by toApiError.
      const message = err instanceof Error && ['no-vendor-account', 'wrong-role'].includes(err.message)
        ? t(`auth.errors.${err.message}`)
        : toApiError(err).user_message
      setServerError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const onLoginPassword = async (e: SyntheticEvent) => {
    e.preventDefault()
    setServerError(null)
    setIsSubmitting(true)
    try {
      await loginWithPassword(phone, password)
      await navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof Error && ['no-vendor-account', 'wrong-role'].includes(err.message)
        ? t(`auth.errors.${err.message}`)
        : toApiError(err).user_message
      setServerError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 dark:bg-gray-950">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(147_51_234/0.12),transparent_45%),radial-gradient(circle_at_80%_80%,rgb(147_51_234/0.10),transparent_45%)]"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <Store className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('auth.loginTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {loginMethod === 'password'
                ? t('auth.passwordPrompt')
                : step === 'phone'
                  ? t('auth.phonePrompt')
                  : t('auth.codePrompt', { phone })}
            </p>
          </div>
        </div>

        {loginMethod === 'password' ? (
          <form onSubmit={(e) => void onLoginPassword(e)} className="flex flex-col gap-4" noValidate>
            <TextInput
              id="phone"
              type="tel"
              autoComplete="tel"
              autoFocus
              label={t('auth.phoneLabel')}
              icon={<Phone className="size-4" aria-hidden="true" />}
              value={phone}
              onChange={(e) => { setPhone(e.target.value) }}
            />
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              label={t('auth.passwordLabel')}
              icon={<Lock className="size-4" aria-hidden="true" />}
              value={password}
              onChange={(e) => { setPassword(e.target.value) }}
            />
            {serverError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{serverError}</p> : null}
            <Button type="submit" isLoading={isSubmitting} className="w-full">
              {t('auth.signIn')}
            </Button>
          </form>
        ) : step === 'phone' ? (
          <form onSubmit={(e) => void onRequestOtp(e)} className="flex flex-col gap-4" noValidate>
            <TextInput
              id="phone"
              type="tel"
              autoComplete="tel"
              autoFocus
              label={t('auth.phoneLabel')}
              icon={<Phone className="size-4" aria-hidden="true" />}
              value={phone}
              onChange={(e) => { setPhone(e.target.value) }}
            />
            {serverError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{serverError}</p> : null}
            <Button type="submit" isLoading={isSubmitting} className="w-full">
              {t('auth.sendCode')}
            </Button>
          </form>
        ) : (
          <form onSubmit={(e) => void onVerifyOtp(e)} className="flex flex-col gap-4" noValidate>
            <TextInput
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              label={t('auth.codeLabel')}
              icon={<KeyRound className="size-4" aria-hidden="true" />}
              value={code}
              onChange={(e) => { setCode(e.target.value) }}
            />
            {serverError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{serverError}</p> : null}
            <Button type="submit" isLoading={isSubmitting} className="w-full">
              {t('auth.verify')}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setCode(''); setServerError(null) }}
              className="text-center text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {t('auth.changePhone')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
