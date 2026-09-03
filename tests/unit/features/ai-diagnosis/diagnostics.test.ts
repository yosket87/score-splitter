import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError, APIConnectionError, APIConnectionTimeoutError } from 'openai/core/error'
import { z } from 'zod'
import { ApiError } from '@/lib/api/client'
import { observeDiagnosisStep, StructuredOutputError } from '@/features/ai-diagnosis/diagnostics'

describe('AI診断の安全な診断ログ', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(250)
  })
  afterEach(() => vi.restoreAllMocks())

  it('API側の許可済みコードを残し、メッセージ・ヘッダー・本文は残さない', async () => {
    const error = new APIError(429, {
      code: 'insufficient_quota', message: 'API_KEY=secret 家賃', param: 'private',
    }, 'secret', new Headers({ 'x-request-id': 'private' }))
    await expect(observeDiagnosisStep('classify', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith('[ai-diagnosis]', {
      stage: 'classify', outcome: 'error', elapsedMs: 150,
      errorKind: 'openai_api', status: 429, code: 'insufficient_quota',
    })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/secret|家賃|private/)
  })

  it.each([
    [new APIConnectionTimeoutError(), 'timeout', null],
    [new APIConnectionError({ message: '秘密' }), 'connection', null],
    [new ApiError('秘密', 500), 'repository', 500],
    [new z.ZodError([]), 'schema_validation', null],
    [new SyntaxError('秘密'), 'json_parse', null],
    [new Error('秘密'), 'unknown', null],
    ['秘密', 'unknown', null],
    [new ApiError('秘密', 999), 'repository', null],
  ])('エラーを固定の分類だけに変換する %#', async (error, errorKind, status) => {
    await expect(observeDiagnosisStep('narrative', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith('[ai-diagnosis]', {
      stage: 'narrative', outcome: 'error', elapsedMs: 150, errorKind, status, code: null,
    })
  })

  it('構造化返答の拒否・対応不一致を検証エラーとして識別する', async () => {
    const error = new StructuredOutputError('秘密のAI返答')
    await expect(observeDiagnosisStep('classify', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith('[ai-diagnosis]', expect.objectContaining({
      errorKind: 'structured_output', code: null,
    }))
  })

  it('未知のAPIコードをログへ流さない', async () => {
    const error = new APIError(400, { code: 'API_KEY=secret 家賃' }, 'secret', new Headers())
    await expect(observeDiagnosisStep('classify', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith('[ai-diagnosis]', expect.objectContaining({ code: null }))
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/secret|家賃/)
  })

  it('構造化出力の許可済み理由だけを記録し、エラー本文を残さない', async () => {
    const error = new StructuredOutputError('秘密のAI返答', 'narrative_person_reference')
    await expect(observeDiagnosisStep('narrative', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith('[ai-diagnosis]', {
      stage: 'narrative', outcome: 'error', elapsedMs: 150,
      errorKind: 'structured_output', status: null, code: null,
      reason: 'narrative_person_reference',
    })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('秘密')
  })

  it('実行時に混入した未知の理由をログへ流さない', async () => {
    const error = Object.assign(new StructuredOutputError('秘密'), { reason: '秘密の家計データ' })
    await expect(observeDiagnosisStep('narrative', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith('[ai-diagnosis]', expect.objectContaining({ reason: null }))
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('秘密')
  })

  it('成功時は結果を変更せず返し、結果本文は記録しない', async () => {
    const result = { private: '支出名とAI返答' }
    expect(await observeDiagnosisStep('narrative', async () => result)).toBe(result)
    expect(console.info).toHaveBeenCalledWith('[ai-diagnosis]', {
      stage: 'narrative', outcome: 'success', elapsedMs: 150,
    })
    expect(console.error).not.toHaveBeenCalled()
  })
})
