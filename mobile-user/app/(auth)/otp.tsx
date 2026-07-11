import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Button } from '../../src/components/ui/button'
import { Screen } from '../../src/components/ui/screen'
import { TextField } from '../../src/components/ui/text-field'
import { useAuth } from '../../src/features/auth/auth-context'
import { toApiError } from '../../src/lib/api-client'

const RESEND_SECONDS = 30

// Blueprint §11.C3: OTP Verify — code input + resend timer. Attempt cap is
// enforced server-side. On success either lands on home (existing user) or
// the register screen (new phone).
export default function OtpScreen() {
  const { t } = useTranslation()
  const { phone } = useLocalSearchParams<{ phone: string }>()
  const { verifyOtp, requestOtp } = useAuth()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (seconds <= 0) return
    const id = setTimeout(() => { setSeconds((s) => s - 1) }, 1000)
    return () => { clearTimeout(id) }
  }, [seconds])

  const submit = async () => {
    if (!phone) return
    setError(null)
    setBusy(true)
    try {
      const result = await verifyOtp(phone, code)
      if (result.kind === 'login') {
        router.replace('/home')
      } else if (result.kind === 'register_required') {
        router.replace({ pathname: '/(auth)/register', params: { token: result.verificationToken } })
      } else {
        setError(t('auth.notAUserDesc'))
      }
    } catch (err) {
      setError(toApiError(err).user_message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!phone || seconds > 0) return
    try {
      await requestOtp(phone)
      setSeconds(RESEND_SECONDS)
    } catch (err) {
      setError(toApiError(err).user_message)
    }
  }

  return (
    <Screen className="justify-center">
      <Text className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('auth.otpTitle')}</Text>
      <Text className="mb-8 text-base text-gray-500 dark:text-gray-400">{t('auth.otpSubtitle', { phone })}</Text>

      <View className="gap-4">
        <TextField
          label={t('auth.otpLabel')}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          autoFocus
          value={code}
          onChangeText={setCode}
        />
        {error ? <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
        <Button label={t('auth.verify')} onPress={() => void submit()} isLoading={busy} />
        <Pressable disabled={seconds > 0} onPress={() => void resend()} className="items-center py-2">
          <Text className={`text-sm ${seconds > 0 ? 'text-gray-400' : 'text-brand-600 dark:text-brand-400'}`}>
            {seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}
