import { useRouter } from 'expo-router'
import { useState, useRef } from 'react'
import { Animated, Dimensions, FlatList, Image, Text, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'

import { Button } from '../src/components/ui/button'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ONBOARDING_STORAGE_KEY = 'meryata_user_onboarded'

interface Slide {
  id: string
  titleKey: string
  descKey: string
  image: any
}

const SLIDES: Slide[] = [
  {
    id: '1',
    titleKey: 'onboarding.title1',
    descKey: 'onboarding.desc1',
    image: require('../assets/icon.png'), // placeholder image, can be replaced
  },
  {
    id: '2',
    titleKey: 'onboarding.title2',
    descKey: 'onboarding.desc2',
    image: require('../assets/icon.png'),
  },
  {
    id: '3',
    titleKey: 'onboarding.title3',
    descKey: 'onboarding.desc3',
    image: require('../assets/icon.png'),
  },
]

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const scrollX = useRef(new Animated.Value(0)).current

  const finishOnboarding = async () => {
    await SecureStore.setItemAsync(ONBOARDING_STORAGE_KEY, 'true')
    router.replace('/(auth)/phone')
  }

  const handleNext = () => {
    if (activeIndex === SLIDES.length - 1) {
      void finishOnboarding()
    } else {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      })
      setActiveIndex(activeIndex + 1)
    }
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems[0] !== undefined) {
      setActiveIndex(viewableItems[0].index)
    }
  }).current

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      {/* Skip Button */}
      <View className="flex-row justify-end px-5 py-2">
        {activeIndex < SLIDES.length - 1 && (
          <Pressable onPress={() => void finishOnboarding()}>
            <Text className="text-sm font-semibold text-gray-400 dark:text-gray-500">
              {t('common.skip', 'Skip')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Slider */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH }} className="items-center justify-center p-8 flex-1">
            <View className="size-48 bg-brand-50 rounded-full items-center justify-center mb-8 dark:bg-brand-950/20">
              <Image source={item.image} className="w-32 h-32 opacity-80" resizeMode="contain" />
            </View>
            <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-3">
              {t(item.titleKey, item.titleKey) as string}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-[280px] leading-relaxed">
              {t(item.descKey, item.descKey) as string}
            </Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      {/* Footer */}
      <View className="px-5 py-8 items-center">
        {/* Pagination Dots */}
        <View className="flex-row gap-1.5 mb-8">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                activeIndex === i ? 'w-5 bg-brand-500' : 'w-1.5 bg-gray-200 dark:bg-gray-800'
              }`}
            />
          ))}
        </View>

        {/* Action Button */}
        <View className="w-full">
          <Button
            label={
              activeIndex === SLIDES.length - 1
                ? (t('onboarding.getStarted', 'Get Started') as string)
                : (t('common.next', 'Next') as string)
            }
            onPress={handleNext}
          />
        </View>
      </View>
    </SafeAreaView>
  )
}
