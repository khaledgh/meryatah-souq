import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  type ViewToken,
} from 'react-native'

import { resolveMediaUrl } from '../../lib/media'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fallbackImage = require('../../../assets/icon.png') as number

interface CarouselProps {
  data: Array<{ id: string; image_url?: string | null; title?: string; target_url?: string | null }>
  autoPlay?: boolean
  interval?: number
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SLIDE_WIDTH = SCREEN_WIDTH - 40

export function Carousel({ data, autoPlay = true, interval = 3500 }: CarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const scrollX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!autoPlay || data.length <= 1) return
    const timer = setInterval(() => {
      const nextIndex = (activeIndex + 1) % data.length
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true })
      setActiveIndex(nextIndex)
    }, interval)
    return () => clearInterval(timer)
  }, [activeIndex, data.length, autoPlay, interval])

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]
    if (first?.index != null) setActiveIndex(first.index)
  }).current

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current

  if (data.length === 0) return null

  return (
    <View>
      <FlatList
        ref={flatListRef}
        data={data}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_WIDTH + 12}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const uri = resolveMediaUrl(item.image_url)
          return (
            <Pressable
              style={{
                width: SLIDE_WIDTH,
                height: 160,
                borderRadius: 24,
                overflow: 'hidden',
                backgroundColor: '#ffc20e22',
              }}
            >
              {uri ? (
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffc20e33',
                  }}
                >
                  <Image source={fallbackImage} style={{ width: 64, height: 64, opacity: 0.4 }} resizeMode="contain" />
                </View>
              )}
              {/* Dark gradient overlay at bottom */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 80,
                  paddingHorizontal: 16,
                  paddingBottom: 14,
                  justifyContent: 'flex-end',
                  backgroundColor: 'rgba(0,0,0,0.35)',
                }}
              >
                {item.title ? (
                  <Text
                    style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                ) : null}
              </View>

              {/* Yellow discount badge */}
              <View
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  backgroundColor: '#ffc20e',
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#1a1a1a', fontWeight: '800', fontSize: 11 }}>OFFER</Text>
              </View>
            </Pressable>
          )
        }}
      />

      {/* Dot pagination */}
      {data.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {data.map((_, i) => (
            <View
              key={i}
              style={{
                height: 6,
                width: activeIndex === i ? 20 : 6,
                borderRadius: 3,
                backgroundColor: activeIndex === i ? '#ffc20e' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </View>
      )}
    </View>
  )
}
