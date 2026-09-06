import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { PaymentStatusPanel } from '@/features/payment-status'
import { getPaymentStatus, recordPayment } from '@/app/actions/payment-status'
import { createHouseholdDataSqlite, householdA, householdB } from '../../helpers/household-data-sqlite'

const browser = vi.hoisted(() => ({ token: 'b'.repeat(64), refresh: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: browser.token }) }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: browser.refresh }), redirect: vi.fn() }))
vi.mock('@/app/actions/revalidation', () => ({ revalidateHouseholdData: vi.fn() }))
afterEach(() => { vi.unstubAllEnvs(); sessionStorage.clear() })

it('別タブのログイン後も古い画面の未確認振込を別世帯へ再送しない', async () => {
  vi.stubEnv('USE_MOCKS', 'false')
  const fixture = createHouseholdDataSqlite()
  vi.mocked(getCloudflareContext).mockReturnValue({ env: { DB: fixture.db } } as never)
  try {
    for (const [context, token] of [[householdA, 'a'.repeat(64)], [householdB, 'b'.repeat(64)]] as const) {
      fixture.sqlite.prepare('INSERT INTO sessions(token,household_id,person,auth_method,expires_at,created_at) VALUES(?,?,NULL,?,?,?)')
        .run(token, context.householdId, 'password', '2099-01-01', 'now')
      fixture.sqlite.prepare('INSERT INTO incomes(household_id,id,month,label,amount,person,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(context.householdId, context.householdId + '-income', '202609', '給与', 1000, 'husband', 'now', 'now')
    }
    browser.token = 'b'.repeat(64)
    const initial = await getPaymentStatus('202609', householdB.householdId)
    expect(initial.success).toBe(true)
    if (!initial.success) throw new Error('初期状態の取得に失敗')
    const input = { month: '202609', operationId: crypto.randomUUID(), expectedRevision: initial.data.revision, confirmedSignedYen: initial.data.remainingSignedYen, paidOn: '2026-09-01' }
    // Bの書込は成功したが、ブラウザには応答が届かなかった状態。
    expect((await recordPayment(input, householdB.householdId)).success).toBe(true)
    sessionStorage.setItem(`payment-operation:${householdB.householdId}:202609`, JSON.stringify({ kind: 'record', input }))
    render(<PaymentStatusPanel householdId={householdB.householdId} month="202609" initialResult={initial} />)
    // 別タブで既存世帯Aへログイン。古いタブのpropsは変わらない。
    browser.token = 'a'.repeat(64)
    await userEvent.click(await screen.findByRole('button', { name: '同じ内容で再送' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ログイン中の世帯が変わりました'))
    const wrongHouseholdPayments = fixture.sqlite.prepare('SELECT household_id, signed_yen, operation_id FROM payment_records WHERE household_id=?').all(householdA.householdId)
    expect(wrongHouseholdPayments).toEqual([])
    expect(sessionStorage.getItem(`payment-operation:${householdB.householdId}:202609`)).not.toBeNull()
    expect(browser.refresh).not.toHaveBeenCalled()
  } finally { fixture.sqlite.close() }
})
