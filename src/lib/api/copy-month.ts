import { apiRequest } from './client'
import type { ApiEnvelope } from './types'
import type { CopyMonthOptions, CopyMonthPreview, CopyMonthResult } from '@/types'

export async function getCopyMonthPreview(
  sourceMonth: string,
  targetMonth: string
): Promise<CopyMonthPreview> {
  const params = new URLSearchParams({ sourceMonth, targetMonth })
  const response = await apiRequest<ApiEnvelope<CopyMonthPreview>>(`/copy-month/preview?${params}`)
  return response.data
}

export async function copyMonthData(options: CopyMonthOptions): Promise<CopyMonthResult> {
  return apiRequest<CopyMonthResult>('/copy-month', {
    method: 'POST',
    body: options,
  })
}
