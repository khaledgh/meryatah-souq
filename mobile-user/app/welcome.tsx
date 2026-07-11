import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  View,
  type ViewToken,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ONBOARDING_STORAGE_KEY = 'meryata_user_onboarded'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SLIDE_IMAGE = require('../assets/icon.png') as number

interface Slide {
  id: string
  titleKey: string
  descKey: string
  image: number
}

const SLIDES: Slide[] = [
  {
    id: '1',
    titleKey: 'onboarding.title1',
    descKey: 'onboarding.desc1',
    image: SLIDE_IMAGE,
  },
  {
    id: '2',
    titleKey: 'onboarding.title2',
    descKey: 'onboarding.desc2',
    image: SLIDE_IMAGE,
  },
  {
    id: '3',
    titleKey: 'onboarding.title3',
    descKey: 'onboarding.desc3',
    image: SLIDE_IMAGE,
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
      const nextIndex = activeIndex + 1
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true })
      setActiveIndex(nextIndex)
    }
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]
    if (first !== undefined && first.index !== null) {
      setActiveIndex(first.index)
    }
  }).current

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current

  const isLast = activeIndex === SLIDES.length - 1

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top', 'bottom']}>
      {/* Skip button */}
      {!isLast && (
        <Pressable
          onPress={() => void finishOnboarding()}
          className="absolute top-12 end-5 z-10 rounded-full bg-white/30 px-4 py-1.5"
        >
          <Text className="text-sm font-semibold text-brand-800 dark:text-brand-300">
            {t('common.skip', 'Skip')}
          </Text>
        </Pressable>
      )}

      {/* Slide Pager */}
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
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH }} className="flex-1">
            {/* Yellow curved upper section */}
            <View
              className="items-center justify-end bg-brand-500"
              style={{
                height: '52%',
                borderBottomLeftRadius: 60,
                borderBottomRightRadius: 60,
                paddingBottom: 36,
              }}
            >
              {/* Illustration circle */}
              <View
                className="bg-brand-400 items-center justify-center shadow-lg"
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.15,
                  shadowRadius: 16,
                  elevation: 12,
                }}
              >
                <View
                  className="bg-white/20 items-center justify-center"
                  style={{ width: 148, height: 148, borderRadius: 74 }}
                >
                  <Image
                    source={item.image}
                    style={{ width: 100, height: 100 }}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>

            {/* White text section */}
            <View className="flex-1 items-center justify-center px-8 pt-8">
              <Text className="mb-3 text-center text-2xl font-extrabold text-gray-900 dark:text-gray-100">
                {t(item.titleKey, item.titleKey) as string}
              </Text>
              <Text className="text-center text-sm leading-6 text-gray-500 dark:text-gray-400 max-w-[280px]">
                {t(item.descKey, item.descKey) as string}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Footer: dots + next button */}
      <View
        className="flex-row items-center justify-between px-8"
        style={{ paddingBottom: Platform.OS === 'ios' ? 20 : 28 }}
      >
        {/* Pagination dots */}
        <View className="flex-row items-center gap-2">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                height: 8,
                width: activeIndex === i ? 24 : 8,
                borderRadius: 4,
                backgroundColor: activeIndex === i ? '#ffc20e' : '#e5e7eb',
              }}
            />
          ))}
        </View>

        {/* Next / Get Started round button */}
        <Pressable
          onPress={handleNext}
          className="items-center justify-center rounded-full bg-brand-500 active:bg-brand-600 shadow-md"
          style={{
            width: 60,
            height: 60,
            shadowColor: '#ffc20e',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          {isLast ? (
            <Text className="text-xs font-bold text-gray-900 text-center px-1">
              {t('onboarding.go', 'Go!')}
            </Text>
          ) : (
            <Feather name="arrow-right" size={26} color="#1a1a1a" />
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
