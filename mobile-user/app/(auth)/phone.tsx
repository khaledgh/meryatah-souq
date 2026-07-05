import { router } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Button } from '../../src/components/ui/button'
import { Screen } from '../../src/components/ui/screen'
import { TextField } from '../../src/components/ui/text-field'
import { useAuth } from '../../src/features/auth/auth-context'
import { toApiError } from '../../src/lib/api-client'

// Blueprint §11.C2: Phone Entry — input phone, request OTP. Rate-limited &
// no enumeration are enforced server-side; the client always advances to the
// code screen on success.
export default function PhoneScreen() {
  const { t } = useTranslation()
  const { requestOtp, bypassAuth } = useAuth()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await requestOtp(phone)
      router.push({ pathname: '/(auth)/otp', params: { phone } })
    } catch (err) {
      setError(toApiError(err).user_message)
    } finally {
      setBusy(false)
    }
  }

  const handleSkip = async () => {
    await bypassAuth()
    router.replace('/(app)/home')
  }

  return (
    <Screen className="justify-center">
      <Text className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('auth.phoneTitle')}</Text>
      <Text className="mb-8 text-base text-gray-500 dark:text-gray-400">{t('auth.phoneSubtitle')}</Text>

      <View className="gap-4">
        <TextField
          label={t('auth.phoneLabel')}
          placeholder={t('auth.phonePlaceholder')}
          keyboardType="phone-pad"
          autoComplete="tel"
          autoFocus
          value={phone}
          onChangeText={setPhone}
        />
        {error ? <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
        <Button label={t('auth.sendCode')} onPress={() => void submit()} isLoading={busy} />
        <Button label={t('auth.skipForNow', 'Skip for now')} variant="secondary" onPress={() => void handleSkip()} />
      </View>
    </Screen>
  )
}
