import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { FakeD1Database, diagnosisView as diagnosisFixture } from '../../helpers/cloudflare-worker-fake'
import {
  acquireDiagnosisLease, getDiagnosisContext, getSavedDiagnosis,
  releaseDiagnosisLease, saveDiagnosis, saveExpenseCategories,
} from '@/lib/api/ai-diagnosis'

vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }))

const diagnosisView = {
  ...diagnosisFixture,
  notableChanges: [],
  positivePoints: [],
  suggestions: [],
}

beforeEach(() => {
  vi.stubEnv('USE_MOCKS', 'false')
  vi.stubEnv('CLOUDFLARE_WORKER_API_URL', '')
  vi.stubEnv('CLOUDFLARE_WORKER_API_TOKEN', '')
  vi.mocked(getCloudflareContext).mockReturnValue({ env: { DB: new FakeD1Database() } } as never)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('HTTP通信は禁止です') }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI診断のD1直接アクセス', () => {
  it('空白だけの実行トークンは400で拒否する', async () => {
    await expect(acquireDiagnosisLease('202601', '   ')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('URLの月と診断結果の月が違う場合は400で保存を拒否する', async () => {
    await expect(saveDiagnosis('202602', {
      runToken: 'run-1', inputHash: 'hash-1', analysisVersion: 'v1',
      diagnosis: diagnosisView, expectedSourceRevision: 0,
    })).rejects.toMatchObject({ status: 400 })
  })

  it('DB未設定時は旧APIへフォールバックせず安全な500を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getCloudflareContext).mockReturnValue({ env: {} } as never)
    await expect(getDiagnosisContext('202601')).rejects.toMatchObject({
      status: 500, message: '内部エラーが発生しました',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('不正な保存済み診断を安全な500で拒否する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getCloudflareContext).mockReturnValue({ env: { DB: new FakeD1Database({
      diagnoses: [{ month: '202601', result_json: '{}', input_hash: 'hash', analysis_version: 'v1', updated_at: '2026-01-01' }],
    }) } } as never)
    await expect(getSavedDiagnosis('202601')).rejects.toMatchObject({
      status: 500, message: '内部エラーが発生しました',
    })
  })

  it.each([
    ['対象データの更新', () => saveDiagnosis('202601', {
      runToken: 'run-1', inputHash: 'hash-1', analysisVersion: 'v1',
      diagnosis: diagnosisView, expectedSourceRevision: 99,
    })],
    ['分類対象のラベル変更', () => saveExpenseCategories('202601', 'run-1', [{
      expenseIds: ['expense-1'], category: 'housing', expectedLabel: '変更前の家賃',
    }])],
    ['失効リースの解放', () => releaseDiagnosisLease('202601', 'other-run')],
    ['失効リースの保存', () => saveDiagnosis('202601', {
      runToken: 'other-run', inputHash: 'hash-1', analysisVersion: 'v1',
      diagnosis: diagnosisView, expectedSourceRevision: 0,
    })],
  ] as const)('%sを内部エラーではなく409として返す', async (_, operation) => {
    await acquireDiagnosisLease('202601', 'run-1')
    await expect(operation()).rejects.toMatchObject({ status: 409 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('実行中は409、リース解放後のクールダウンは429を返す', async () => {
    await acquireDiagnosisLease('202601', 'run-1')
    await expect(acquireDiagnosisLease('202601', 'run-2')).rejects.toMatchObject({ status: 409 })
    await expect(releaseDiagnosisLease('202601', 'run-1')).resolves.toBeUndefined()
    await expect(acquireDiagnosisLease('202601', 'run-2')).rejects.toMatchObject({ status: 429 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('同じD1でリース取得・分類・診断保存を行い、保存結果を再取得できる', async () => {
    expect(await getSavedDiagnosis('202601')).toBeNull()
    await acquireDiagnosisLease('202601', 'run-1')
    const context = await getDiagnosisContext('202601')
    await saveExpenseCategories('202601', 'run-1', [{
      expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃',
    }])
    expect((await getDiagnosisContext('202601')).expenses[0].aiCategory).toBe('housing')
    await expect(saveDiagnosis('202601', {
      runToken: 'run-1', inputHash: 'hash-1', analysisVersion: 'v1',
      diagnosis: diagnosisView, expectedSourceRevision: context.sourceRevision,
    })).resolves.toEqual(diagnosisView)
    expect(await getSavedDiagnosis('202601')).toMatchObject({
      diagnosis: diagnosisView, inputHash: 'hash-1', analysisVersion: 'v1',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('旧APIの設定なしで接続先D1の診断対象を取得し、担当者を含めない', async () => {
    const context = await getDiagnosisContext('202601')
    expect(context.expenses[0]).toMatchObject({ id: 'expense-1', label: '家賃' })
    expect(context.expenses[0]).not.toHaveProperty('person')
    expect(fetch).not.toHaveBeenCalled()
  })
})
