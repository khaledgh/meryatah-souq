import { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, FlatList, Image, View } from 'react-native'

interface CarouselProps {
  data: Array<{ id: string; image_url?: string; title?: string }>
  autoPlay?: boolean
  interval?: number
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CAROUSEL_WIDTH = SCREEN_WIDTH - 40 // Matches px-5 padding

export function Carousel({ data, autoPlay = true, interval = 3000 }: CarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const scrollX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!autoPlay || data.length <= 1) return

    const timer = setInterval(() => {
      const nextIndex = (activeIndex + 1) % data.length
      flatListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
      })
      setActiveIndex(nextIndex)
    }, interval)

    return () => clearInterval(timer)
  }, [activeIndex, data.length, autoPlay, interval])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems[0] !== undefined) {
      setActiveIndex(viewableItems[0].index)
    }
  }).current

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current

  if (data.length === 0) return null

  return (
    <View className="relative w-full">
      <FlatList
        ref={flatListRef}
        data={data}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={CAROUSEL_WIDTH + 12} // width + spacing
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        renderItem={({ item }) => (
          <View
            style={{ width: CAROUSEL_WIDTH }}
            className="mr-3 h-40 rounded-3xl overflow-hidden bg-emerald-50 dark:bg-emerald-950/20"
          >
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-full h-full items-center justify-center">
                <Image
                  source={require('../../../assets/icon.png')}
                  className="w-16 h-16 opacity-30"
                  resizeMode="contain"
                />
              </View>
            )}
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      {data.length > 1 && (
        <View className="flex-row justify-center gap-1.5 mt-3">
          {data.map((_, i) => (
            <View
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                activeIndex === i ? 'w-4 bg-emerald-600' : 'w-1.5 bg-gray-300 dark:bg-gray-700'
              }`}
            />
          ))}
        </View>
      )}
    </View>
  )
}
