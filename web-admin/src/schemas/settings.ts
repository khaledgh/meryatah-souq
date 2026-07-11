import { z } from 'zod'

export const appConfigSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string().optional(),
  updated_at: z.string(),
})

export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  config: z.unknown(),
  updated_at: z.string(),
})

export const settingsSnapshotSchema = z.object({
  // Accept null off the wire but hand consumers guaranteed arrays — the
  // settings page maps over both directly, which would throw on null.
  data: z.object({
    app_configs: z
      .array(appConfigSchema)
      .nullable()
      .transform((rows) => rows ?? []),
    feature_flags: z
      .array(featureFlagSchema)
      .nullable()
      .transform((rows) => rows ?? []),
  }),
})

export type AppConfig = z.infer<typeof appConfigSchema>
export type FeatureFlag = z.infer<typeof featureFlagSchema>
