import React, { createContext, useContext, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

export interface CartItem {
  id: string // product ID
  name: string
  priceUsd: number
  quantity: number
  vendorId: string
  vendorName: string
  imageUrl?: string
}

interface CartContextValue {
  items: CartItem[]
  addToCart: (item: Omit<CartItem, 'quantity'>) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, qty: number) => void
  clearCart: () => void
  subtotal: number
}

const CartContext = createContext<CartContextValue | null>(null)
const CART_STORAGE_KEY = 'meryata_user_cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  useEffect(() => {
    void SecureStore.getItemAsync(CART_STORAGE_KEY).then((data) => {
      if (data) {
        try {
          setItems(JSON.parse(data))
        } catch {
          // ignore malformed storage
        }
      }
    })
  }, [])

  const saveCart = async (newItems: CartItem[]) => {
    setItems(newItems)
    await SecureStore.setItemAsync(CART_STORAGE_KEY, JSON.stringify(newItems))
  }

  const addToCart = (item: Omit<CartItem, 'quantity'>) => {
    const existing = items.find((i) => i.id === item.id)
    if (existing) {
      updateQuantity(item.id, existing.quantity + 1)
    } else {
      // If adding from a different vendor, clear the cart first (marketplace rules)
      const diffVendor = items.find((i) => i.vendorId !== item.vendorId)
      const nextItems = diffVendor ? [{ ...item, quantity: 1 }] : [...items, { ...item, quantity: 1 }]
      void saveCart(nextItems)
    }
  }

  const removeFromCart = (productId: string) => {
    const nextItems = items.filter((i) => i.id !== productId)
    void saveCart(nextItems)
  }

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId)
    } else {
      const nextItems = items.map((i) => (i.id === productId ? { ...i, quantity: qty } : i))
      void saveCart(nextItems)
    }
  }

  const clearCart = () => {
    void saveCart([])
  }

  const subtotal = items.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return ctx
}
