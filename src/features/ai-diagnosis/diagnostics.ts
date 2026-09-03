import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai/core/error'
import { z } from 'zod'
import { ApiError } from '@/lib/api/client'

type DiagnosisStage = 'load' | 'generate' | 'context' | 'saved_result' | 'acquire_lease'
  | 'release_lease' | 'classify' | 'narrative' | 'save_categories' | 'save_result'

const STRUCTURED_OUTPUT_REASONS = [
  'data_sufficiency_mismatch', 'candidate_id_mismatch', 'missing_candidate_commentary',
  'narrative_number', 'narrative_person_reference', 'narrative_judgment',
  'classification_coverage_mismatch', 'missing_parsed_output', 'refusal',
] as const

type StructuredOutputReason = typeof STRUCTURED_OUTPUT_REASONS[number]
const SAFE_STRUCTURED_OUTPUT_REASONS = new Set<string>(STRUCTURED_OUTPUT_REASONS)

export class StructuredOutputError extends Error {
  constructor(message: string, readonly reason?: StructuredOutputReason) {
    super(message)
  }
}

const SAFE_API_CODES = new Set([
  'invalid_api_key', 'insufficient_quota', 'model_not_found', 'invalid_json_schema',
  'unsupported_parameter', 'rate_limit_exceeded', 'invalid_request_error',
])

export async function observeDiagnosisStep<T>(
  stage: DiagnosisStage,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now()
  try {
    const result = await operation()
    console.info('[ai-diagnosis]', {
      stage, outcome: 'success', elapsedMs: Math.round(performance.now() - startedAt),
    })
    return result
  } catch (error) {
    // エラー本文・stack・入力・返答は記録せず、固定の分類だけを残す。
    console.error('[ai-diagnosis]', {
      stage, outcome: 'error', elapsedMs: Math.round(performance.now() - startedAt),
      ...classifyError(error),
    })
    throw error
  }
}

function classifyError(error: unknown) {
  const status = error instanceof APIError || error instanceof ApiError ? error.status : undefined
  const safeStatus = typeof status === 'number' && Number.isInteger(status)
    && status >= 400 && status <= 599 ? status : null
  const code = error instanceof APIError && typeof error.code === 'string'
    && SAFE_API_CODES.has(error.code) ? error.code : null
  const structuredDetails = error instanceof StructuredOutputError
    ? { reason: typeof error.reason === 'string' && SAFE_STRUCTURED_OUTPUT_REASONS.has(error.reason)
      ? error.reason : null }
    : {}
  return { errorKind: getErrorKind(error), status: safeStatus, code, ...structuredDetails }
}

function getErrorKind(error: unknown): string {
  if (error instanceof APIConnectionTimeoutError) return 'timeout'
  if (error instanceof APIConnectionError) return 'connection'
  if (error instanceof APIError) return 'openai_api'
  if (error instanceof ApiError) return 'repository'
  if (error instanceof z.ZodError) return 'schema_validation'
  if (error instanceof SyntaxError) return 'json_parse'
  if (error instanceof StructuredOutputError) return 'structured_output'
  return 'unknown'
}
