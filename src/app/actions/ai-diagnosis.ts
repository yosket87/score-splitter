'use server'

import {
  acquireDiagnosisLease,
  getDiagnosisContext,
  getSavedDiagnosis,
  releaseDiagnosisLease,
  saveDiagnosis,
  saveExpenseCategories,
} from '@/lib/api/ai-diagnosis'
import { ApiError } from '@/lib/api/client'
import { isValidMonth } from '@/lib/utils/format'
import { requireAuth } from '@/lib/webauthn/session'
import type {
  AiDiagnosisView,
  DiagnosisSnapshot,
} from '@/features/ai-diagnosis/domain'
import {
  createAiDiagnosisProvider,
  type AiDiagnosisProvider,
} from '@/features/ai-diagnosis/provider'
import {
  createAiDiagnosisService,
  NoActualExpensesError,
  type AiDiagnosisRepository,
  type AiDiagnosisService,
} from '@/features/ai-diagnosis/service'
import type { ActionResult } from '@/types'

export async function loadAiDiagnosis(
  month: string
): Promise<ActionResult<DiagnosisSnapshot>> {
  await requireAuth()
  if (!isValidMonth(month)) {
    return { success: false, error: '月の形式が不正です' }
  }

  try {
    const diagnosis = await createRequestService().load(month)
    return { success: true, data: diagnosis }
  } catch {
    console.error('AI診断取得エラー')
    return { success: false, error: 'AI診断に失敗しました' }
  }
}

export async function generateAiDiagnosis(
  month: string
): Promise<ActionResult<AiDiagnosisView>> {
  await requireAuth()
  if (!isValidMonth(month)) {
    return { success: false, error: '月の形式が不正です' }
  }

  try {
    const diagnosis = await createRequestService().run(month)
    return { success: true, data: diagnosis }
  } catch (error) {
    console.error('AI診断生成エラー')
    if (error instanceof ApiError && error.status === 409) {
      return { success: false, error: '診断を実行中です' }
    }
    if (error instanceof ApiError && error.status === 429) {
      return {
        success: false,
        error: 'しばらく待ってから再診断してください',
      }
    }
    if (error instanceof NoActualExpensesError) {
      return {
        success: false,
        error: '診断できる支出データがありません',
      }
    }
    return { success: false, error: 'AI診断に失敗しました' }
  }
}

function createRequestService(): AiDiagnosisService {
  return createAiDiagnosisService({
    repository: createRepository(),
    provider: createLazyProvider(),
    randomUUID: () => crypto.randomUUID(),
    logReleaseError: () => {
      console.error('AI診断リース解放エラー')
    },
  })
}

function createLazyProvider(): AiDiagnosisProvider {
  let provider: AiDiagnosisProvider | undefined
  const getProvider = (): AiDiagnosisProvider => {
    provider ??= createAiDiagnosisProvider()
    return provider
  }

  return {
    classifyLabels: (labels) => getProvider().classifyLabels(labels),
    generateNarrative: (input) => getProvider().generateNarrative(input),
  }
}

function createRepository(): AiDiagnosisRepository {
  return {
    getContext: getDiagnosisContext,
    getSavedDiagnosis,
    acquireLease: acquireDiagnosisLease,
    saveCategories: saveExpenseCategories,
    saveDiagnosis,
    releaseLease: releaseDiagnosisLease,
  }
}
