import type { ComponentType } from 'react'

import type { TemplateKind } from '../../theme/template-kinds'
import { ElectronicsProductCard } from './electronics-template'
import { FoodProductCard } from './food-template'
import { GenericProductCard } from './generic-template'
import { MarketProductCard } from './market-template'
import type { ProductCardProps } from './product-card-types'

export type { ProductCardProps } from './product-card-types'

interface TemplateDefinition {
  ProductCard: ComponentType<ProductCardProps>
  // FlatList numColumns for the product listing — food is a single-column
  // menu list, the others are 2-column grids.
  numColumns: 1 | 2
}

const templates: Record<TemplateKind, TemplateDefinition> = {
  food: { ProductCard: FoodProductCard, numColumns: 1 },
  electronics: { ProductCard: ElectronicsProductCard, numColumns: 2 },
  market: { ProductCard: MarketProductCard, numColumns: 2 },
  generic: { ProductCard: GenericProductCard, numColumns: 2 },
}

export function templateFor(kind: TemplateKind | string | undefined): TemplateDefinition {
  if (kind && kind in templates) {
    return templates[kind as TemplateKind]
  }
  return templates.generic
}
