import { useEffect, useRef } from 'react'
import { Animated, View, type DimensionValue } from 'react-native'

interface SkeletonProps {
  width?: DimensionValue
  height?: DimensionValue
  borderRadius?: number
  className?: string
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  className = '',
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    )
    animation.start()

    return () => animation.stop()
  }, [opacity])

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius,
        opacity,
      }}
      className={`bg-gray-200 dark:bg-gray-800 ${className}`}
    />
  )
}

export function VendorCardSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <Skeleton width={56} height={56} borderRadius={12} />
      <View className="flex-1 gap-2">
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
      </View>
      <Skeleton width={50} height={24} borderRadius={99} />
    </View>
  )
}

export function ProductCardSkeleton() {
  return (
    <View className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 gap-2">
      <Skeleton width="100%" height={120} borderRadius={12} />
      <Skeleton width="80%" height={16} />
      <Skeleton width="50%" height={12} />
      <View className="flex-row items-center justify-between mt-1">
        <Skeleton width={60} height={20} />
        <Skeleton width={32} height={32} borderRadius={8} />
      </View>
    </View>
  )
}
