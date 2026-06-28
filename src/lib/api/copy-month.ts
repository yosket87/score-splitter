import { apiRequest } from './client'
import type { CopyMonthOptions, CopyMonthPreview, CopyMonthResult } from '@/types'

interface ApiData<T> {
  data: T
}

export async function getCopyMonthPreview(
  sourceMonth: string,
  targetMonth: string
): Promise<CopyMonthPreview> {
  const params = new URLSearchParams({ sourceMonth, targetMonth })
  const response = await apiRequest<ApiData<CopyMonthPreview>>(`/copy-month/preview?${params}`)
  return response.data
}

export async function copyMonthData(options: CopyMonthOptions): Promise<CopyMonthResult> {
  return apiRequest<CopyMonthResult>('/copy-month', {
    method: 'POST',
    body: options,
  })
}
