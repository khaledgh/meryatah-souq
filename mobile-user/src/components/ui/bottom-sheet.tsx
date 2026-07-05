import { useEffect, useRef } from 'react'
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

const SCREEN_HEIGHT = Dimensions.get('window').height

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const animatedValue = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (open) {
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    } else {
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start()
    }
  }, [open, animatedValue])

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  })

  const backdropOpacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  })

  return (
    <Modal
      transparent
      visible={open}
      onRequestClose={onClose}
      animationType="none"
    >
      <View className="flex-1 justify-end">
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: '#000',
              opacity: backdropOpacity,
            },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={{ transform: [{ translateY }] }}
          className="bg-white rounded-t-3xl max-h-[85%] border-t border-gray-100 dark:bg-gray-900 dark:border-gray-800"
        >
          <View className="items-center py-3">
            <View className="w-12 h-1.5 bg-gray-200 rounded-full dark:bg-gray-700" />
          </View>

          {title && (
            <View className="px-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {title}
              </Text>
            </View>
          )}

          <View className="p-5">{children}</View>
        </Animated.View>
      </View>
    </Modal>
  )
}
