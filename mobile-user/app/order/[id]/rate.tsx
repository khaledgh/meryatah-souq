import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { Button } from '../../../src/components/ui/button'
import { useRateDriver } from '../../../src/features/orders/use-rate-driver'
import { toApiError } from '../../../src/lib/api-client'

export default function RateDriverScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const rateDriver = useRateDriver()

  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  const handleSubmit = async () => {
    if (!orderId) return

    try {
      await rateDriver.mutateAsync({
        orderId,
        score: rating,
        comment: comment.trim() ? comment.trim() : undefined,
      })

      Alert.alert(
        t('rating.successTitle', 'Thank you!'),
        t('rating.successMessage', 'Your rating has been submitted successfully.'),
        [
          {
            text: t('common.ok', 'OK'),
            onPress: () => router.replace('/orders'),
          },
        ]
      )
    } catch (err) {
      Alert.alert(t('common.error', 'Error'), toApiError(err).user_message || t('rating.failed', 'Failed to submit rating'))
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-gray-50 dark:border-gray-900">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="x" size={24} color="#374151" />
        </Pressable>
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
          {t('rating.title', 'Rate Driver')}
        </Text>
        <View className="w-8" />
      </View>

      <View className="flex-1 p-5 gap-6 justify-center items-center">
        <View className="items-center gap-2">
          <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center">
            {t('rating.prompt', 'How was your delivery?')}
          </Text>
          <Text className="text-sm text-gray-400 dark:text-gray-500 text-center">
            {t('rating.subprompt', 'Please rate your delivery experience and driver.')}
          </Text>
        </View>

        {/* Stars Row */}
        <View className="flex-row gap-3 my-4">
          {[1, 2, 3, 4, 5].map((star) => {
            const isSelected = star <= rating
            return (
              <Pressable key={star} onPress={() => setRating(star)} className="p-1.5">
                <Feather
                  name="star"
                  size={40}
                  color={isSelected ? '#F59E0B' : '#E5E7EB'}
                />
              </Pressable>
            )
          })}
        </View>

        {/* Comments Area */}
        <View className="w-full gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('rating.commentsLabel', 'Add a comment (optional)')}
          </Text>
          <TextInput
            multiline
            numberOfLines={4}
            value={comment}
            onChangeText={setComment}
            placeholder={t('rating.commentsPlaceholder', 'Tell us about the driver or delivery...')}
            placeholderTextColor="#9ca3af"
            style={{ textAlignVertical: 'top' }}
            className="w-full border border-gray-200 rounded-2xl p-4 text-base text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 min-h-[100px]"
          />
        </View>

        {/* Submit */}
        <View className="w-full mt-4">
          <Button
            label={t('rating.submitBtn', 'Submit Review')}
            onPress={handleSubmit}
            isLoading={rateDriver.isPending}
          />
        </View>
      </View>
    </SafeAreaView>
  )
}
