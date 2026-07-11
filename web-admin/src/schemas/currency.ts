import { z } from 'zod'

export const currencyWithRateSchema = z.object({
  code: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  is_active: z.boolean(),
  rate: z.number(),
  updated_at: z.string(),
})

export const currencyListSchema = z.object({
  data: z.array(currencyWithRateSchema).nullable(),
})

export type CurrencyWithRate = z.infer<typeof currencyWithRateSchema>
