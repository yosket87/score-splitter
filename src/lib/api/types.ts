import { z } from 'zod'

export interface ApiEnvelope<T> {
  data: T
}

export function apiEnvelopeSchema<TData>(
  dataSchema: z.ZodType<TData>
): z.ZodType<ApiEnvelope<TData>> {
  return z.object({ data: dataSchema })
}
