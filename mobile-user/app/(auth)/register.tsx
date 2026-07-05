import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Button } from '../../src/components/ui/button'
import { Screen } from '../../src/components/ui/screen'
import { TextField } from '../../src/components/ui/text-field'
import { useAuth } from '../../src/features/auth/auth-context'
import { toApiError } from '../../src/lib/api-client'

// Blueprint §11.C4: Register (new numbers only) — first name, last name,
// password, locale. Reached only when verify-otp returned register_required.
export default function RegisterScreen() {
  const { t, i18n } = useTranslation()
  const { token } = useLocalSearchParams<{ token: string }>()
  const { completeRegistration } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!token) return
    setError(null)
    setBusy(true)
    try {
      await completeRegistration({
        verificationToken: token,
        firstName,
        lastName,
        password,
        preferredLocale: i18n.language,
      })
      router.replace('/(app)/home')
    } catch (err) {
      setError(toApiError(err).user_message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="justify-center">
      <Text className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('auth.registerTitle')}</Text>
      <Text className="mb-8 text-base text-gray-500 dark:text-gray-400">{t('auth.registerSubtitle')}</Text>

      <View className="gap-4">
        <TextField label={t('auth.firstName')} autoComplete="given-name" value={firstName} onChangeText={setFirstName} />
        <TextField label={t('auth.lastName')} autoComplete="family-name" value={lastName} onChangeText={setLastName} />
        <TextField label={t('auth.password')} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
        {error ? <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
        <Button label={t('auth.createAccount')} onPress={() => void submit()} isLoading={busy} />
      </View>
    </Screen>
  )
}
