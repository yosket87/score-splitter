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
import { requireHouseholdContext, type HouseholdContext } from '@/lib/household-context'
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
  SOURCE_REVISION_CONFLICT_MESSAGE,
  SourceRevisionConflictError,
  type AiDiagnosisRepository,
  type AiDiagnosisService,
} from '@/features/ai-diagnosis/service'
import type { ActionResult } from '@/types'
import { observeDiagnosisStep } from '@/features/ai-diagnosis/diagnostics'

type GenerateAiDiagnosisResult = ActionResult<AiDiagnosisView> & {
  errorCode?: 'source_revision_conflict'
}

export async function loadAiDiagnosis(
  month: string
): Promise<ActionResult<DiagnosisSnapshot>> {
  const context = await requireHouseholdContext()
  if (!isValidMonth(month)) {
    return { success: false, error: '月の形式が不正です' }
  }

  try {
    const diagnosis = await observeDiagnosisStep('load', () => createRequestService(context).load(month))
    return { success: true, data: diagnosis }
  } catch {
    console.error('AI診断取得エラー')
    return { success: false, error: 'AI診断に失敗しました' }
  }
}

export async function generateAiDiagnosis(
  month: string
): Promise<GenerateAiDiagnosisResult> {
  const context = await requireHouseholdContext()
  if (!isValidMonth(month)) {
    return { success: false, error: '月の形式が不正です' }
  }

  try {
    const diagnosis = await observeDiagnosisStep('generate', () => createRequestService(context).run(month))
    return { success: true, data: diagnosis }
  } catch (error) {
    console.error('AI診断生成エラー')
    if (
      error instanceof SourceRevisionConflictError ||
      (error instanceof ApiError &&
        error.status === 409 &&
        error.message === SOURCE_REVISION_CONFLICT_MESSAGE)
    ) {
      return {
        success: false,
        error: '家計データが更新されました。最新データで再診断してください',
        errorCode: 'source_revision_conflict',
      }
    }
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

function createRequestService(context: HouseholdContext): AiDiagnosisService {
  return createAiDiagnosisService({
    repository: createRepository(context),
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
    classifyLabels: (labels) => observeDiagnosisStep('classify', () => getProvider().classifyLabels(labels)),
    generateNarrative: (input) => observeDiagnosisStep('narrative', () => getProvider().generateNarrative(input)),
  }
}

function createRepository(context: HouseholdContext): AiDiagnosisRepository {
  return {
    getContext: (month) => observeDiagnosisStep('context', () => getDiagnosisContext(context, month)),
    getSavedDiagnosis: (month) => observeDiagnosisStep('saved_result', () => getSavedDiagnosis(context, month)),
    acquireLease: (month, token) => observeDiagnosisStep('acquire_lease', () => acquireDiagnosisLease(context, month, token)),
    saveCategories: (month, token, assignments) => observeDiagnosisStep('save_categories', () => saveExpenseCategories(context, month, token, assignments)),
    saveDiagnosis: (month, input) => observeDiagnosisStep('save_result', () => saveDiagnosis(context, month, input)),
    releaseLease: (month, token) => observeDiagnosisStep('release_lease', () => releaseDiagnosisLease(context, month, token)),
  }
}
