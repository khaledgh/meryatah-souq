import type { Product } from '../../schemas/product'

// Shared props every per-category product card variant accepts, so
// vendor/[id].tsx can render whichever one TemplateSwitch picks without
// branching on props shape itself.
export interface ProductCardProps {
  product: Product
  accentColor: string
  onPress: () => void
  onAdd: () => void
}
