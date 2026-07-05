# ウェイトリストLP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 夫婦向け家計精算アプリ（仮称: ヤマワケ）の需要検証用ウェイトリストLPを `/lp` に公開し、登録データをD1に保存する。

**Architecture:** 既存Next.js 16アプリに認証除外の `/lp` ルートを追加。LPは `src/features/waitlist-lp/` に配置し、精算シミュレーターは既存の純関数 `calculateSettlement` を再利用。登録はServer Action → 既存Worker APIの新設公開エンドポイント `POST /waitlist` → D1 の一方向。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS 4 / shadcn/ui / Zod 4 / Cloudflare Workers + D1 / Vitest / Playwright / MSW

**Spec:** `docs/superpowers/specs/2026-07-05-waitlist-lp-design.md`

## Global Constraints

- コミットメッセージはConventional Commits形式・日本語（例: `feat: ウェイトリスト登録APIを追加`）。生成情報（Co-Authored-By等）を含めない
- `page.tsx` / `layout.tsx` 以外は named export のみ
- feature外部からのimportは `@/features/waitlist-lp`（index.tsx）経由のみ。Zodスキーマは `src/lib/validations/` に置く（feature内に置かない）
- UIコピーに内部技術名（D1 / Worker / API等）を出さない
- サービス仮称は「ヤマワケ」、想定価格コピーは「世帯 月380円（先行登録者は6ヶ月無料）」で統一
- 価格意向の値は `'free_only'`（無料なら使いたい）と `'paid_ok'`（月380円でも使いたい）の2値で統一
- honeypotフィールド名は `website` で統一
- TDD: 各タスクでテストを先に書き、失敗を確認してから実装する
- テスト実行は `npx vitest run <path>`（watchモード禁止）。E2Eは `npm run test:e2e`

---

### Task 1: Worker API — waitlist公開エンドポイント + D1 migration

**Files:**
- Create: `cloudflare/worker/migrations/0004_add_waitlist_entries.sql`
- Create: `cloudflare/worker/src/waitlist.ts`
- Modify: `cloudflare/worker/src/index.ts:42-51`（認証前にwaitlistルートを分岐）
- Test: `tests/unit/cloudflare/waitlist.test.ts`

**Interfaces:**
- Consumes: `handleRequest(request, env, deps)` / `D1DatabaseLike` / `Runtime`（`cloudflare/worker/src/d1.ts`）、`HttpError` / `json` / `readJson`（`cloudflare/worker/src/http.ts`）
- Produces: `POST /waitlist`（認証不要）。リクエスト `{ email: string, priceIntent: 'free_only'|'paid_ok', simulatorUsed: boolean, website?: string }` → レスポンス `201 { data: { registered: true } }`。バリデーションエラーは `400 { error: string }`

- [ ] **Step 1: migrationファイルを作成**

```sql
-- 0004_add_waitlist_entries.sql
-- ウェイトリスト登録（LP経由の需要検証用）
CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  price_intent TEXT NOT NULL CHECK (price_intent IN ('free_only', 'paid_ok')),
  simulator_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/unit/cloudflare/waitlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from '../../../cloudflare/worker/src/d1'

class FakeStatement implements D1PreparedStatementLike {
  private values: unknown[] = []

  constructor(
    private readonly db: FakeWaitlistDb,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.values = values
    return this
  }

  first<T>(): Promise<T | null> {
    throw new Error('not implemented')
  }

  all<T>(): Promise<{ results: T[] }> {
    throw new Error('not implemented')
  }

  async run(): Promise<D1ResultLike> {
    this.db.runs.push({ query: this.query, values: this.values })
    return { success: true }
  }
}

class FakeWaitlistDb implements D1DatabaseLike {
  runs: { query: string; values: unknown[] }[] = []

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query)
  }

  batch(): Promise<D1ResultLike[]> {
    throw new Error('not implemented')
  }
}

const deps = {
  randomUUID: () => 'waitlist-uuid-1',
  now: () => new Date('2026-07-05T00:00:00.000Z'),
}

function waitlistRequest(body: unknown): Request {
  return new Request('https://worker.local/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createEnv(db: FakeWaitlistDb) {
  return { DB: db, WORKER_API_TOKEN: 'test-token' }
}

describe('POST /waitlist', () => {
  it('認証ヘッダなしで登録でき、正規化した値でINSERTする', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({
        email: ' Couple@Example.com ',
        priceIntent: 'paid_ok',
        simulatorUsed: true,
      }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { registered: true } })
    expect(db.runs).toHaveLength(1)
    expect(db.runs[0].query).toContain('INSERT INTO waitlist_entries')
    expect(db.runs[0].query).toContain('ON CONFLICT(email) DO NOTHING')
    expect(db.runs[0].values).toEqual([
      'waitlist-uuid-1',
      'couple@example.com',
      'paid_ok',
      1,
      '2026-07-05T00:00:00.000Z',
    ])
  })

  it('メール形式が不正なら400を返す', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({ email: 'not-an-email', priceIntent: 'free_only', simulatorUsed: false }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(400)
    expect(db.runs).toHaveLength(0)
  })

  it('価格意向が不正なら400を返す', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({ email: 'a@example.com', priceIntent: 'maybe', simulatorUsed: false }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(400)
    expect(db.runs).toHaveLength(0)
  })

  it('honeypotに値があれば成功を装い保存しない', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({
        email: 'bot@example.com',
        priceIntent: 'free_only',
        simulatorUsed: false,
        website: 'https://spam.example.com',
      }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { registered: true } })
    expect(db.runs).toHaveLength(0)
  })

  it('waitlist以外のルートは引き続き認証必須', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      new Request('https://worker.local/incomes?month=202607'),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npx vitest run tests/unit/cloudflare/waitlist.test.ts`
Expected: FAIL（`/waitlist` が404または401を返す）

- [ ] **Step 4: waitlist.tsを実装**

`cloudflare/worker/src/waitlist.ts`:

```ts
import type { D1DatabaseLike, Runtime } from './d1'
import { HttpError } from './http'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PRICE_INTENTS = ['free_only', 'paid_ok'] as const

type PriceIntent = (typeof PRICE_INTENTS)[number]

interface WaitlistPayload {
  email: string
  priceIntent: PriceIntent
  simulatorUsed: boolean
  website?: string
}

export async function registerWaitlistEntry(
  db: D1DatabaseLike,
  runtime: Runtime,
  payload: unknown
): Promise<{ registered: boolean }> {
  const input = parseWaitlistPayload(payload)

  // honeypot: botには成功を装い、保存しない
  if (input.website !== undefined && input.website.trim() !== '') {
    return { registered: true }
  }

  // email重複は成功として扱う（登録済みかどうかを外部から探れないようにする）
  await db
    .prepare(
      `INSERT INTO waitlist_entries (id, email, price_intent, simulator_used, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    )
    .bind(
      runtime.randomUUID(),
      input.email,
      input.priceIntent,
      input.simulatorUsed ? 1 : 0,
      runtime.now().toISOString()
    )
    .run()

  return { registered: true }
}

function parseWaitlistPayload(payload: unknown): WaitlistPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new HttpError('リクエストの形式が不正です', 400)
  }

  const { email, priceIntent, simulatorUsed, website } = payload as Record<string, unknown>

  if (typeof email !== 'string') {
    throw new HttpError('メールアドレスを入力してください', 400)
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 255) {
    throw new HttpError('メールアドレスの形式が正しくありません', 400)
  }

  if (!isPriceIntent(priceIntent)) {
    throw new HttpError('料金の希望が不正です', 400)
  }

  if (typeof simulatorUsed !== 'boolean') {
    throw new HttpError('リクエストの形式が不正です', 400)
  }

  if (website !== undefined && typeof website !== 'string') {
    throw new HttpError('リクエストの形式が不正です', 400)
  }

  return { email: normalizedEmail, priceIntent, simulatorUsed, website }
}

function isPriceIntent(value: unknown): value is PriceIntent {
  return typeof value === 'string' && (PRICE_INTENTS as readonly string[]).includes(value)
}
```

- [ ] **Step 5: index.tsにルートを追加**

`cloudflare/worker/src/index.ts` の `handleRequest` 冒頭（`try {` 直後〜`assertAuth`）を変更する。

変更前:

```ts
  try {
    assertAuth(request, env.WORKER_API_TOKEN)
    const runtime = createRuntime(deps)
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
```

変更後:

```ts
  try {
    const runtime = createRuntime(deps)
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    // ウェイトリスト登録はLPから未認証で呼ばれる唯一の公開エンドポイント
    if (parts.length === 1 && parts[0] === 'waitlist' && request.method === 'POST') {
      return json(
        { data: await registerWaitlistEntry(env.DB, runtime, await readJson(request)) },
        { status: 201 }
      )
    }

    assertAuth(request, env.WORKER_API_TOKEN)
```

importに追加:

```ts
import { registerWaitlistEntry } from './waitlist'
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run tests/unit/cloudflare/waitlist.test.ts tests/unit/cloudflare/worker.test.ts`
Expected: PASS（既存のworker.test.tsも含め全件）

- [ ] **Step 7: コミット**

```bash
git add cloudflare/worker/migrations/0004_add_waitlist_entries.sql cloudflare/worker/src/waitlist.ts cloudflare/worker/src/index.ts tests/unit/cloudflare/waitlist.test.ts
git commit -m "feat: Worker APIにウェイトリスト登録の公開エンドポイントを追加"
```

---

### Task 2: Zodスキーマ + APIクライアント + Server Action

**Files:**
- Create: `src/lib/validations/waitlist.ts`
- Create: `src/lib/api/waitlist.ts`
- Create: `src/app/actions/waitlist.ts`
- Modify: `tests/mocks/api.ts`（waitlist APIモックを追加）
- Test: `tests/unit/validations/waitlist.test.ts`
- Test: `tests/integration/actions/waitlist.test.ts`

**Interfaces:**
- Consumes: `apiRequest(path, options)`（`src/lib/api/client.ts`）、`ActionResult`（`src/types`）、Task 1の `POST /waitlist`
- Produces:
  - `waitlistFormSchema`: `z.object({ email, priceIntent, simulatorUsed })`、`WaitlistInput = z.infer<typeof waitlistFormSchema>`（`{ email: string; priceIntent: 'free_only'|'paid_ok'; simulatorUsed: boolean }`）
  - `registerWaitlist(input: WaitlistInput): Promise<void>`
  - `joinWaitlist(prevState: ActionResult | null, formData: FormData): Promise<ActionResult>` — useActionState互換シグネチャ。FormDataキーは `email` / `priceIntent` / `simulatorUsed`（`'true'|'false'`）/ `website`（honeypot）

- [ ] **Step 1: バリデーションの失敗するテストを書く**

`tests/unit/validations/waitlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { waitlistFormSchema } from '@/lib/validations/waitlist'

describe('waitlistFormSchema', () => {
  it('有効な入力を受け付ける', () => {
    const result = waitlistFormSchema.safeParse({
      email: 'couple@example.com',
      priceIntent: 'paid_ok',
      simulatorUsed: true,
    })
    expect(result.success).toBe(true)
  })

  it('不正なメールアドレスを拒否する', () => {
    const result = waitlistFormSchema.safeParse({
      email: 'not-an-email',
      priceIntent: 'free_only',
      simulatorUsed: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('メールアドレスの形式が正しくありません')
    }
  })

  it('不正な価格意向を拒否する', () => {
    const result = waitlistFormSchema.safeParse({
      email: 'couple@example.com',
      priceIntent: 'maybe',
      simulatorUsed: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('料金の希望を選択してください')
    }
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/validations/waitlist.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: スキーマを実装**

`src/lib/validations/waitlist.ts`:

```ts
import { z } from 'zod'

export const waitlistFormSchema = z.object({
  email: z
    .email('メールアドレスの形式が正しくありません')
    .max(255, 'メールアドレスが長すぎます'),
  priceIntent: z.enum(['free_only', 'paid_ok'], {
    message: '料金の希望を選択してください',
  }),
  simulatorUsed: z.boolean(),
})

export type WaitlistInput = z.infer<typeof waitlistFormSchema>
```

- [ ] **Step 4: スキーマのテストが通ることを確認**

Run: `npx vitest run tests/unit/validations/waitlist.test.ts`
Expected: PASS

- [ ] **Step 5: APIクライアントを実装**

`src/lib/api/waitlist.ts`:

```ts
import { apiRequest } from './client'
import type { WaitlistInput } from '@/lib/validations/waitlist'

export async function registerWaitlist(input: WaitlistInput): Promise<void> {
  await apiRequest('waitlist', { method: 'POST', body: input })
}
```

- [ ] **Step 6: tests/mocks/api.tsにwaitlistモックを追加**

`tests/mocks/api.ts` に以下を追加する。

`passkeysApiMock` の定義の直後に:

```ts
const waitlistApiMock = vi.hoisted(() => ({
  registerWaitlist: vi.fn(),
}))
```

`vi.mock('@/lib/api/passkeys', () => passkeysApiMock)` の直後に:

```ts
vi.mock('@/lib/api/waitlist', () => waitlistApiMock)
```

`export const mockPasskeysApi = passkeysApiMock` の直後に:

```ts
export const mockWaitlistApi = waitlistApiMock
```

`clearApiMocks` 内の配列に `mockWaitlistApi` を追加:

```ts
  for (const group of [
    mockRecordsApi,
    mockMonthlySummaryApi,
    mockCopyMonthApi,
    mockSessionsApi,
    mockPasskeysApi,
    mockWaitlistApi,
  ]) {
```

- [ ] **Step 7: Server Actionの失敗するテストを書く**

`tests/integration/actions/waitlist.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import { clearApiMocks, mockWaitlistApi } from '../../../tests/mocks/api'
import { joinWaitlist } from '@/app/actions/waitlist'

function createWaitlistFormData(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData()
  formData.set('email', 'couple@example.com')
  formData.set('priceIntent', 'paid_ok')
  formData.set('simulatorUsed', 'true')
  formData.set('website', '')
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value)
  }
  return formData
}

describe('joinWaitlist', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
  })

  it('有効な入力で登録しsuccessを返す', async () => {
    mockWaitlistApi.registerWaitlist.mockResolvedValueOnce(undefined)

    const result = await joinWaitlist(null, createWaitlistFormData())

    expect(mockWaitlistApi.registerWaitlist).toHaveBeenCalledWith({
      email: 'couple@example.com',
      priceIntent: 'paid_ok',
      simulatorUsed: true,
    })
    expect(result).toEqual({ success: true })
  })

  it('不正なメールアドレスはバリデーションエラーを返す', async () => {
    const result = await joinWaitlist(
      null,
      createWaitlistFormData({ email: 'not-an-email' })
    )

    expect(result).toEqual({
      success: false,
      error: 'メールアドレスの形式が正しくありません',
    })
    expect(mockWaitlistApi.registerWaitlist).not.toHaveBeenCalled()
  })

  it('honeypotに値があれば成功を装いAPIを呼ばない', async () => {
    const result = await joinWaitlist(
      null,
      createWaitlistFormData({ website: 'https://spam.example.com' })
    )

    expect(result).toEqual({ success: true })
    expect(mockWaitlistApi.registerWaitlist).not.toHaveBeenCalled()
  })

  it('API障害時はユーザー向けエラーを返す', async () => {
    mockWaitlistApi.registerWaitlist.mockRejectedValueOnce(new Error('API error'))

    const result = await joinWaitlist(null, createWaitlistFormData())

    expect(result).toEqual({
      success: false,
      error: '登録に失敗しました。時間をおいて再度お試しください',
    })
  })
})
```

- [ ] **Step 8: テストが失敗することを確認**

Run: `npx vitest run tests/integration/actions/waitlist.test.ts`
Expected: FAIL（`@/app/actions/waitlist` が存在しない）

- [ ] **Step 9: Server Actionを実装**

`src/app/actions/waitlist.ts`:

```ts
'use server'

import { registerWaitlist } from '@/lib/api/waitlist'
import { waitlistFormSchema } from '@/lib/validations/waitlist'
import type { ActionResult } from '@/types'

export async function joinWaitlist(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  // honeypot: botには成功を装って何もしない
  const website = formData.get('website')
  if (typeof website === 'string' && website.trim() !== '') {
    return { success: true }
  }

  const parsed = waitlistFormSchema.safeParse({
    email: formData.get('email'),
    priceIntent: formData.get('priceIntent'),
    simulatorUsed: formData.get('simulatorUsed') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    await registerWaitlist(parsed.data)
    return { success: true }
  } catch (error) {
    console.error('ウェイトリスト登録エラー:', error)
    return {
      success: false,
      error: '登録に失敗しました。時間をおいて再度お試しください',
    }
  }
}
```

- [ ] **Step 10: テストが通ることを確認**

Run: `npx vitest run tests/integration/actions/waitlist.test.ts tests/integration/actions`
Expected: PASS（既存のaction統合テストも含め全件。mocks/api.ts変更のリグレッション確認）

- [ ] **Step 11: コミット**

```bash
git add src/lib/validations/waitlist.ts src/lib/api/waitlist.ts src/app/actions/waitlist.ts tests/mocks/api.ts tests/unit/validations/waitlist.test.ts tests/integration/actions/waitlist.test.ts
git commit -m "feat: ウェイトリスト登録のServer Actionとバリデーションを追加"
```

---

### Task 3: 精算シミュレーター計算ユーティリティ

**Files:**
- Create: `src/features/waitlist-lp/utils.ts`
- Test: `tests/unit/features/waitlist-lp-utils.test.ts`

**Interfaces:**
- Consumes: `calculateSettlement(incomes, expenses, carryovers?)`（`src/lib/utils/calculation.ts`）
- Produces:
  - `SimulatorInput = { myIncome: number; partnerIncome: number; sharedExpense: number }`
  - `SimulatorResult = { allowance: number; amount: number; payer: 'me' | 'partner' }`
  - `simulateSettlement(input: SimulatorInput): SimulatorResult`
  - 前提: 共通経費は「あなた」が支払った想定（LP上にもその旨を表示する）

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/features/waitlist-lp-utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { simulateSettlement } from '@/features/waitlist-lp/utils'

describe('simulateSettlement', () => {
  it('収入差があるときパートナーからあなたへの精算額を計算する', () => {
    // あなた30万・パートナー20万・経費18万 → 残り32万を山分けで各16万
    // あなたは 30万-18万=12万 しか残っていないので、パートナーから4万受け取る
    const result = simulateSettlement({
      myIncome: 300000,
      partnerIncome: 200000,
      sharedExpense: 180000,
    })

    expect(result.allowance).toBe(160000)
    expect(result.amount).toBe(40000)
    expect(result.payer).toBe('partner')
  })

  it('あなたの手残りが取り分を超えるときはあなたが支払う', () => {
    // あなた30万・パートナー10万・経費4万 → 各18万。あなたの手残り26万 → 8万支払う
    const result = simulateSettlement({
      myIncome: 300000,
      partnerIncome: 100000,
      sharedExpense: 40000,
    })

    expect(result.allowance).toBe(180000)
    expect(result.amount).toBe(80000)
    expect(result.payer).toBe('me')
  })

  it('全て0のときは精算なし', () => {
    const result = simulateSettlement({
      myIncome: 0,
      partnerIncome: 0,
      sharedExpense: 0,
    })

    expect(result.allowance).toBe(0)
    expect(result.amount).toBe(0)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/features/waitlist-lp-utils.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`src/features/waitlist-lp/utils.ts`:

```ts
import { calculateSettlement } from '@/lib/utils/calculation'

export interface SimulatorInput {
  myIncome: number
  partnerIncome: number
  sharedExpense: number
}

export interface SimulatorResult {
  /** 山分け後のひとり分の取り分 */
  allowance: number
  /** 精算額（絶対値） */
  amount: number
  /** 精算額を支払う側 */
  payer: 'me' | 'partner'
}

/**
 * LPシミュレーター用の精算計算。
 * 「あなた」をhusband、「パートナー」をwifeに割り当て、
 * 共通経費はあなたが支払った前提で計算する（支出は負値で渡す規約）。
 */
export function simulateSettlement(input: SimulatorInput): SimulatorResult {
  const result = calculateSettlement(
    [
      { id: 'sim-my-income', month: '000000', label: 'あなたの収入', amount: input.myIncome, person: 'husband' },
      { id: 'sim-partner-income', month: '000000', label: 'パートナーの収入', amount: input.partnerIncome, person: 'wife' },
    ],
    [
      {
        id: 'sim-shared-expense',
        month: '000000',
        label: '共通経費',
        amount: -input.sharedExpense,
        person: 'husband',
        isCarryover: false,
      },
    ]
  )

  return {
    allowance: result.allowance,
    amount: Math.abs(result.settlement),
    payer: result.settlement >= 0 ? 'me' : 'partner',
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/unit/features/waitlist-lp-utils.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/waitlist-lp/utils.ts tests/unit/features/waitlist-lp-utils.test.ts
git commit -m "feat: LP精算シミュレーターの計算ユーティリティを追加"
```

---

### Task 4: シミュレーター利用状態プロバイダーと静的セクション

**Files:**
- Create: `src/features/waitlist-lp/components/simulator-usage-provider.tsx`
- Create: `src/features/waitlist-lp/components/hero.tsx`
- Create: `src/features/waitlist-lp/components/problem-section.tsx`
- Create: `src/features/waitlist-lp/components/feature-section.tsx`
- Create: `src/features/waitlist-lp/components/faq-section.tsx`
- Create: `src/features/waitlist-lp/components/lp-footer.tsx`
- Test: `tests/components/features/waitlist-lp/simulator-usage-provider.test.tsx`

**Interfaces:**
- Consumes: なし（自己完結）
- Produces:
  - `SimulatorUsageProvider({ children })` / `useSimulatorUsage(): { simulatorUsed: boolean; markSimulatorUsed: () => void }` — Task 5のシミュレーターが `markSimulatorUsed` を呼び、Task 6のフォームが `simulatorUsed` を読む
  - `Hero` / `ProblemSection` / `FeatureSection` / `FaqSection` / `LpFooter` — propsなしの表示コンポーネント。登録フォームへのアンカーは `#signup`

- [ ] **Step 1: プロバイダーの失敗するテストを書く**

`tests/components/features/waitlist-lp/simulator-usage-provider.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  SimulatorUsageProvider,
  useSimulatorUsage,
} from '@/features/waitlist-lp/components/simulator-usage-provider'

function Probe() {
  const { simulatorUsed, markSimulatorUsed } = useSimulatorUsage()
  return (
    <button type="button" onClick={markSimulatorUsed}>
      {simulatorUsed ? 'used' : 'unused'}
    </button>
  )
}

describe('SimulatorUsageProvider', () => {
  it('初期値はfalseで、markSimulatorUsedでtrueになる', async () => {
    const user = userEvent.setup()
    render(
      <SimulatorUsageProvider>
        <Probe />
      </SimulatorUsageProvider>
    )

    expect(screen.getByRole('button', { name: 'unused' })).toBeInTheDocument()
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'used' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/components/features/waitlist-lp/simulator-usage-provider.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: プロバイダーを実装**

`src/features/waitlist-lp/components/simulator-usage-provider.tsx`:

```tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface SimulatorUsage {
  simulatorUsed: boolean
  markSimulatorUsed: () => void
}

const SimulatorUsageContext = createContext<SimulatorUsage | null>(null)

export function SimulatorUsageProvider({ children }: { children: ReactNode }) {
  const [simulatorUsed, setSimulatorUsed] = useState(false)
  const markSimulatorUsed = useCallback(() => setSimulatorUsed(true), [])
  const value = useMemo(
    () => ({ simulatorUsed, markSimulatorUsed }),
    [simulatorUsed, markSimulatorUsed]
  )

  return (
    <SimulatorUsageContext.Provider value={value}>
      {children}
    </SimulatorUsageContext.Provider>
  )
}

export function useSimulatorUsage(): SimulatorUsage {
  const context = useContext(SimulatorUsageContext)
  if (!context) {
    throw new Error('SimulatorUsageProvider内で使用してください')
  }
  return context
}
```

- [ ] **Step 4: プロバイダーのテストが通ることを確認**

Run: `npx vitest run tests/components/features/waitlist-lp/simulator-usage-provider.test.tsx`
Expected: PASS

- [ ] **Step 5: 静的セクションを実装**

`src/features/waitlist-lp/components/hero.tsx`:

```tsx
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="px-6 pt-20 pb-16 text-center sm:pt-28">
      <p className="text-sm font-semibold tracking-widest text-primary">
        ヤマワケ（仮称）
      </p>
      <h1 className="mx-auto mt-4 max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">
        ふたりの収入から、ふたりの経費を引いて、残りを山分け。
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
        共働き夫婦の毎月の精算を、1つの数字で終わらせる家計アプリを準備中です。
        ウェイトリストに登録すると、公開時に最初にご案内します。
      </p>
      <Button asChild size="lg" className="mt-8">
        <a href="#signup">ウェイトリストに登録</a>
      </Button>
    </section>
  )
}
```

`src/features/waitlist-lp/components/problem-section.tsx`:

```tsx
const problems = [
  {
    title: '精算がExcel頼み',
    description:
      '毎月末にスプレッドシートを開いて、収入と立替をコピペして関数を直す。その作業、毎月やっていませんか。',
  },
  {
    title: '立替の記憶が消える',
    description:
      '「先月の旅行、どっちがいくら払ったっけ？」精算が遅れるほど、記憶とレシートは消えていきます。',
  },
  {
    title: '収入差の気まずさ',
    description:
      '完全折半は収入差があると不公平。かといって話し合いで毎回決めるのは気まずい。ルールをアプリに任せましょう。',
  },
]

export function ProblemSection() {
  return (
    <section className="bg-muted/50 px-6 py-16">
      <h2 className="text-center text-2xl font-bold">
        こんな精算、していませんか
      </h2>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
        {problems.map((problem) => (
          <div key={problem.title} className="rounded-lg bg-background p-6 shadow-sm">
            <h3 className="font-semibold">{problem.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {problem.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

`src/features/waitlist-lp/components/feature-section.tsx`:

```tsx
const features = [
  {
    title: '月ごとに記録',
    description:
      'ふたりの収入と共通経費を月単位で記録。どちらが払ったかも一緒に残ります。',
  },
  {
    title: '繰越も忘れない',
    description:
      '今月精算しない立替は繰越として翌月へ。精算し忘れがなくなります。',
  },
  {
    title: '精算額は自動計算',
    description:
      '収入合計から経費を引いて残りを山分け。「どちらがいくら払うか」が1つの数字で出ます。',
  },
]

export function FeatureSection() {
  return (
    <section className="px-6 py-16">
      <h2 className="text-center text-2xl font-bold">ヤマワケができること</h2>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-lg border p-6">
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

`src/features/waitlist-lp/components/faq-section.tsx`:

```tsx
const faqs = [
  {
    question: 'いつから使えますか？',
    answer:
      '現在開発中です。ウェイトリスト登録者から順に、公開時にメールでご案内します。',
  },
  {
    question: '本当に月380円かかりますか？',
    answer:
      '想定している価格です。先行登録いただいた方は6ヶ月無料でお使いいただける予定です。正式な価格は公開時にご案内します。',
  },
  {
    question: '夫婦でなくても使えますか？',
    answer:
      '同棲中のカップルなど、ふたりで家計を分け合う関係であればお使いいただけます。',
  },
  {
    question: '入力したデータは安全ですか？',
    answer:
      'シミュレーターに入力した金額は保存も送信もされません。登録いただくのはメールアドレスと料金の希望のみです。',
  },
]

export function FaqSection() {
  return (
    <section className="bg-muted/50 px-6 py-16">
      <h2 className="text-center text-2xl font-bold">よくある質問</h2>
      <dl className="mx-auto mt-10 max-w-2xl space-y-6">
        {faqs.map((faq) => (
          <div key={faq.question} className="rounded-lg bg-background p-6 shadow-sm">
            <dt className="font-semibold">{faq.question}</dt>
            <dd className="mt-2 text-sm text-muted-foreground">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
```

`src/features/waitlist-lp/components/lp-footer.tsx`:

```tsx
export function LpFooter() {
  return (
    <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
      <p>ヤマワケ（仮称）は個人開発のサービスです。</p>
      <p className="mt-1">
        お問い合わせ: <a href="mailto:tanaka@doublejump.tokyo" className="underline">tanaka@doublejump.tokyo</a>
      </p>
    </footer>
  )
}
```

- [ ] **Step 6: 全テストのリグレッション確認**

Run: `npx vitest run tests/components/features/waitlist-lp`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/features/waitlist-lp/components tests/components/features/waitlist-lp
git commit -m "feat: ウェイトリストLPの静的セクションと利用状態プロバイダーを追加"
```

---

### Task 5: 精算シミュレーターUI

**Files:**
- Create: `src/features/waitlist-lp/components/settlement-simulator.tsx`
- Test: `tests/components/features/waitlist-lp/settlement-simulator.test.tsx`

**Interfaces:**
- Consumes: `simulateSettlement` / `SimulatorInput`（Task 3）、`useSimulatorUsage`（Task 4）、`formatCurrency`（`src/lib/utils/format.ts`）、`Card` / `Input` / `Label`（`@/components/ui/*`）
- Produces: `SettlementSimulator`（propsなし）。入力ラベルは「あなたの月収」「パートナーの月収」「共通経費」。結果表示に `ひとりの取り分` と精算額（例: `¥40,000`）、方向（`パートナー → あなた` / `あなた → パートナー`）を含む。初回入力時に `markSimulatorUsed()` を呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`tests/components/features/waitlist-lp/settlement-simulator.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettlementSimulator } from '@/features/waitlist-lp/components/settlement-simulator'
import {
  SimulatorUsageProvider,
  useSimulatorUsage,
} from '@/features/waitlist-lp/components/simulator-usage-provider'

function UsageProbe() {
  const { simulatorUsed } = useSimulatorUsage()
  return <output data-testid="usage">{simulatorUsed ? 'used' : 'unused'}</output>
}

function renderSimulator() {
  return render(
    <SimulatorUsageProvider>
      <SettlementSimulator />
      <UsageProbe />
    </SimulatorUsageProvider>
  )
}

describe('SettlementSimulator', () => {
  it('入力に応じて精算額と方向を表示する', async () => {
    const user = userEvent.setup()
    renderSimulator()

    await user.type(screen.getByLabelText('あなたの月収'), '300000')
    await user.type(screen.getByLabelText('パートナーの月収'), '200000')
    await user.type(screen.getByLabelText('共通経費'), '180000')

    expect(screen.getByText('¥160,000')).toBeInTheDocument()
    expect(screen.getByText('¥40,000')).toBeInTheDocument()
    expect(screen.getByText('パートナー → あなた')).toBeInTheDocument()
  })

  it('入力するとシミュレーター利用済みになる', async () => {
    const user = userEvent.setup()
    renderSimulator()

    expect(screen.getByTestId('usage')).toHaveTextContent('unused')
    await user.type(screen.getByLabelText('あなたの月収'), '1')
    expect(screen.getByTestId('usage')).toHaveTextContent('used')
  })

  it('入力値が送信されないことを明記している', () => {
    renderSimulator()
    expect(
      screen.getByText('入力した金額は保存も送信もされません。')
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/components/features/waitlist-lp/settlement-simulator.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`src/features/waitlist-lp/components/settlement-simulator.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format'
import { simulateSettlement, type SimulatorInput } from '../utils'
import { useSimulatorUsage } from './simulator-usage-provider'

const fields = [
  { key: 'myIncome', label: 'あなたの月収', placeholder: '300000' },
  { key: 'partnerIncome', label: 'パートナーの月収', placeholder: '200000' },
  { key: 'sharedExpense', label: '共通経費', placeholder: '180000' },
] as const

export function SettlementSimulator() {
  const { markSimulatorUsed } = useSimulatorUsage()
  const [input, setInput] = useState<SimulatorInput>({
    myIncome: 0,
    partnerIncome: 0,
    sharedExpense: 0,
  })

  const result = simulateSettlement(input)

  const handleChange = (key: keyof SimulatorInput, rawValue: string) => {
    markSimulatorUsed()
    const value = Number(rawValue)
    setInput((previous) => ({
      ...previous,
      [key]: Number.isFinite(value) && value >= 0 ? value : 0,
    }))
  }

  return (
    <section className="px-6 py-16">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>ふたりの精算額を試してみる</CardTitle>
          <p className="text-sm text-muted-foreground">
            共通経費はあなたが支払った想定で計算します。
            入力した金額は保存も送信もされません。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`simulator-${field.key}`}>{field.label}</Label>
                <Input
                  id={`simulator-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={field.placeholder}
                  onChange={(event) => handleChange(field.key, event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-muted p-6 text-center">
            <p className="text-sm text-muted-foreground">ひとりの取り分</p>
            <p className="text-2xl font-bold">{formatCurrency(result.allowance)}</p>
            <p className="mt-4 text-sm text-muted-foreground">今月の精算</p>
            <p className="text-lg font-semibold">
              {result.payer === 'me' ? 'あなた → パートナー' : 'パートナー → あなた'}
            </p>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(result.amount)}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/components/features/waitlist-lp/settlement-simulator.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/features/waitlist-lp/components/settlement-simulator.tsx tests/components/features/waitlist-lp/settlement-simulator.test.tsx
git commit -m "feat: LPに精算シミュレーターUIを追加"
```

---

### Task 6: 登録フォームUIと価格セクション

**Files:**
- Create: `src/features/waitlist-lp/components/waitlist-form.tsx`
- Create: `src/features/waitlist-lp/components/signup-section.tsx`
- Create: `src/features/waitlist-lp/index.tsx`
- Test: `tests/components/features/waitlist-lp/waitlist-form.test.tsx`

**Interfaces:**
- Consumes: `joinWaitlist(prevState, formData)`（Task 2）、`useSimulatorUsage`（Task 4）、`SubmitButton` / `Input` / `Label`（`@/components/ui/*`）、Task 4・5の全セクションコンポーネント
- Produces:
  - `WaitlistForm`（propsなし）— useActionStateで `joinWaitlist` を呼ぶ。成功時はフォームを完了メッセージ「登録ありがとうございます。準備ができたらご連絡します。」に置き換える
  - `SignupSection`（propsなし）— `id="signup"` を持ち、価格提示とWaitlistFormを含む
  - `WaitlistLp`（propsなし、`index.tsx`）— LP全体を合成した外部公開コンポーネント

- [ ] **Step 1: 失敗するテストを書く**

`tests/components/features/waitlist-lp/waitlist-form.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ActionResult } from '@/types'

const joinWaitlistMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: joinWaitlistMock }))

import { WaitlistForm } from '@/features/waitlist-lp/components/waitlist-form'
import { SimulatorUsageProvider } from '@/features/waitlist-lp/components/simulator-usage-provider'

function renderForm() {
  return render(
    <SimulatorUsageProvider>
      <WaitlistForm />
    </SimulatorUsageProvider>
  )
}

describe('WaitlistForm', () => {
  beforeEach(() => {
    joinWaitlistMock.mockReset()
  })

  it('メール・価格意向・honeypotのフィールドを持つ', () => {
    renderForm()

    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.getByLabelText('無料なら使いたい')).toBeInTheDocument()
    expect(screen.getByLabelText('月380円でも使いたい')).toBeInTheDocument()

    const honeypot = document.querySelector('input[name="website"]')
    expect(honeypot).not.toBeNull()
    expect(honeypot).toHaveAttribute('tabindex', '-1')
  })

  it('送信成功で完了メッセージを表示する', async () => {
    const user = userEvent.setup()
    joinWaitlistMock.mockResolvedValueOnce({ success: true } satisfies ActionResult)
    renderForm()

    await user.type(screen.getByLabelText('メールアドレス'), 'couple@example.com')
    await user.click(screen.getByLabelText('月380円でも使いたい'))
    await user.click(screen.getByRole('button', { name: 'ウェイトリストに登録' }))

    expect(
      await screen.findByText('登録ありがとうございます。準備ができたらご連絡します。')
    ).toBeInTheDocument()
  })

  it('エラー時はメッセージを表示しフォームを維持する', async () => {
    const user = userEvent.setup()
    joinWaitlistMock.mockResolvedValueOnce({
      success: false,
      error: '登録に失敗しました。時間をおいて再度お試しください',
    } satisfies ActionResult)
    renderForm()

    await user.type(screen.getByLabelText('メールアドレス'), 'couple@example.com')
    await user.click(screen.getByRole('button', { name: 'ウェイトリストに登録' }))

    expect(
      await screen.findByText('登録に失敗しました。時間をおいて再度お試しください')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/components/features/waitlist-lp/waitlist-form.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: フォームを実装**

`src/features/waitlist-lp/components/waitlist-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { useSimulatorUsage } from './simulator-usage-provider'
import type { ActionResult } from '@/types'

export function WaitlistForm() {
  const { simulatorUsed } = useSimulatorUsage()
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    joinWaitlist,
    null
  )

  if (state?.success) {
    return (
      <p role="status" className="rounded-lg bg-muted p-6 text-center font-semibold">
        登録ありがとうございます。準備ができたらご連絡します。
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="waitlist-email">メールアドレス</Label>
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">料金の希望</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="priceIntent" value="free_only" defaultChecked />
          無料なら使いたい
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="priceIntent" value="paid_ok" />
          月380円でも使いたい
        </label>
      </fieldset>

      {/* bot対策: 人間には見えないフィールド。値が入っていたら登録しない */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name="simulatorUsed" value={String(simulatorUsed)} />

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full" pendingChildren="送信中...">
        ウェイトリストに登録
      </SubmitButton>
    </form>
  )
}
```

- [ ] **Step 4: 価格セクションとindex.tsxを実装**

`src/features/waitlist-lp/components/signup-section.tsx`:

```tsx
import { WaitlistForm } from './waitlist-form'

export function SignupSection() {
  return (
    <section id="signup" className="px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold">先行登録を受付中</h2>
        <p className="mt-4 text-4xl font-bold">
          月380円
          <span className="text-base font-normal text-muted-foreground">
            /世帯（想定）
          </span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          先行登録者は6ヶ月無料でご案内する予定です。
        </p>
        <div className="mt-8 text-left">
          <WaitlistForm />
        </div>
      </div>
    </section>
  )
}
```

`src/features/waitlist-lp/index.tsx`:

```tsx
import { SimulatorUsageProvider } from './components/simulator-usage-provider'
import { Hero } from './components/hero'
import { SettlementSimulator } from './components/settlement-simulator'
import { ProblemSection } from './components/problem-section'
import { FeatureSection } from './components/feature-section'
import { SignupSection } from './components/signup-section'
import { FaqSection } from './components/faq-section'
import { LpFooter } from './components/lp-footer'

export function WaitlistLp() {
  return (
    <SimulatorUsageProvider>
      <main id="main">
        <Hero />
        <SettlementSimulator />
        <ProblemSection />
        <FeatureSection />
        <SignupSection />
        <FaqSection />
      </main>
      <LpFooter />
    </SimulatorUsageProvider>
  )
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run tests/components/features/waitlist-lp`
Expected: PASS（waitlist-lp配下の全コンポーネントテスト）

- [ ] **Step 6: コミット**

```bash
git add src/features/waitlist-lp tests/components/features/waitlist-lp/waitlist-form.test.tsx
git commit -m "feat: ウェイトリスト登録フォームとLP全体の合成を追加"
```

---

### Task 7: LPページ公開（page.tsx + middleware認証除外）

**Files:**
- Create: `src/app/lp/page.tsx`
- Modify: `src/middleware.ts:34-41`（matcherから `/lp` を除外）

**Interfaces:**
- Consumes: `WaitlistLp`（Task 6）
- Produces: 未認証でアクセス可能な `/lp` ページ（metadata付き）

- [ ] **Step 1: page.tsxを作成**

`src/app/lp/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { WaitlistLp } from '@/features/waitlist-lp'

export const metadata: Metadata = {
  title: 'ヤマワケ（仮称）| ふたりの収入から経費を引いて、残りを山分け',
  description:
    '共働き夫婦の毎月の精算を1つの数字で終わらせる家計アプリを準備中。収入合算から共通経費を引いて残りを山分けする精算額を自動計算します。ウェイトリスト受付中。',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'ヤマワケ（仮称）| ふたりの家計を山分けする精算アプリ',
    description:
      '収入合算から共通経費を引いて残りを山分け。共働き夫婦のための精算アプリのウェイトリスト受付中です。',
    type: 'website',
  },
}

export default function LpPage() {
  return <WaitlistLp />
}
```

- [ ] **Step 2: middlewareのmatcherから/lpを除外**

`src/middleware.ts` の `config` を変更する。

変更前:

```ts
export const config = {
  matcher: [
    // ルートパスとその他のページパスに適用
    '/',
    '/login',
    '/((?!_next|favicon.ico|api).*)',
  ],
}
```

変更後:

```ts
export const config = {
  matcher: [
    // ルートパスとその他のページパスに適用（/lpは公開LPのため認証対象外）
    '/',
    '/login',
    '/((?!_next|favicon.ico|api|lp).*)',
  ],
}
```

- [ ] **Step 3: 既存テストのリグレッション確認**

Run: `npx vitest run`
Expected: PASS（全件）

- [ ] **Step 4: dev:mockで手動確認**

Run: `npm run dev:mock` をバックグラウンド起動し、`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/lp` を実行
Expected: `200`（`/login` へのリダイレクト307ではない）

確認後にdevサーバーを停止する。

- [ ] **Step 5: コミット**

```bash
git add src/app/lp/page.tsx src/middleware.ts
git commit -m "feat: ウェイトリストLPページを認証なしで公開"
```

---

### Task 8: MSWモックとE2Eテスト

**Files:**
- Modify: `src/mocks/db.ts`（initStoreに `waitlist_entries: []` を追加）
- Modify: `src/mocks/handlers.ts`（`POST /waitlist` ハンドラーを追加）
- Test: `tests/e2e/waitlist-lp.spec.ts`

**Interfaces:**
- Consumes: `getTable(table)`（`src/mocks/db.ts`）、Task 1のリクエスト/レスポンス契約、Task 7の公開 `/lp`
- Produces: `USE_MOCKS=true` 環境で動作する `POST /waitlist` モックとE2Eテスト

- [ ] **Step 1: E2Eテストを書く**

`tests/e2e/waitlist-lp.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('ウェイトリストLP', () => {
  test('未ログインでLPを表示し、シミュレーターと登録が動作する', async ({ page }) => {
    await page.goto('/lp')

    // 未認証でも/loginにリダイレクトされない
    await expect(page).toHaveURL(/\/lp$/)
    await expect(
      page.getByRole('heading', {
        name: 'ふたりの収入から、ふたりの経費を引いて、残りを山分け。',
      })
    ).toBeVisible()

    // シミュレーター
    await page.getByLabel('あなたの月収').fill('300000')
    await page.getByLabel('パートナーの月収').fill('200000')
    await page.getByLabel('共通経費').fill('180000')
    await expect(page.getByText('¥40,000')).toBeVisible()
    await expect(page.getByText('パートナー → あなた')).toBeVisible()

    // 登録フォーム
    await page.getByLabel('メールアドレス').fill('couple@example.com')
    await page.getByLabel('月380円でも使いたい').check()
    await page.getByRole('button', { name: 'ウェイトリストに登録' }).click()
    await expect(
      page.getByText('登録ありがとうございます。準備ができたらご連絡します。')
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: E2Eが失敗することを確認**

Run: `npm run test:e2e -- waitlist-lp`
Expected: FAIL（登録送信がモック未対応で完了メッセージが出ない）

注意: `/lp` 表示とシミュレーターまでは通り、フォーム送信で失敗するはず。表示自体で失敗する場合はTask 7を見直すこと。

- [ ] **Step 3: モックDBにテーブルを追加**

`src/mocks/db.ts` の `initStore` を変更する。

変更前:

```ts
    passkey_credentials: structuredClone(seedData.passkey_credentials),
    webauthn_challenges: [],
  }
```

変更後:

```ts
    passkey_credentials: structuredClone(seedData.passkey_credentials),
    webauthn_challenges: [],
    waitlist_entries: [],
  }
```

- [ ] **Step 4: MSWハンドラーを追加**

`src/mocks/handlers.ts` の `handlers` 配列の先頭（`login-attempts` ハンドラー群の前）に追加する。公開エンドポイントなので `isAuthorized` チェックは行わない（Worker本体と同じ挙動）。

```ts
  http.post(`${WORKER_API_URL}/waitlist`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string
      priceIntent?: string
      simulatorUsed?: boolean
      website?: string
    }

    // honeypot: 成功を装い保存しない
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return HttpResponse.json({ data: { registered: true } }, { status: 201 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const validIntent = body.priceIntent === 'free_only' || body.priceIntent === 'paid_ok'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validIntent) {
      return HttpResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
    }

    const table = getTable('waitlist_entries')
    if (!table.some((row) => row.email === email)) {
      table.push({
        id: `waitlist-${table.length + 1}`,
        email,
        price_intent: body.priceIntent,
        simulator_used: body.simulatorUsed ? 1 : 0,
        created_at: new Date().toISOString(),
      })
    }
    return HttpResponse.json({ data: { registered: true } }, { status: 201 })
  }),
```

- [ ] **Step 5: E2Eが通ることを確認**

Run: `npm run test:e2e -- waitlist-lp`
Expected: PASS

- [ ] **Step 6: E2E全件のリグレッション確認**

Run: `npm run test:e2e`
Expected: PASS（既存のhousehold-flow / reduced-motionも含む）

- [ ] **Step 7: コミット**

```bash
git add src/mocks/db.ts src/mocks/handlers.ts tests/e2e/waitlist-lp.spec.ts
git commit -m "test: ウェイトリストLPのMSWモックとE2Eテストを追加"
```

---

### Task 9: 最終検証とドキュメント更新

**Files:**
- Modify: `CLAUDE.md`（features一覧に `waitlist-lp` を追記）
- Modify: `docs/database.md`（`waitlist_entries` テーブルを追記）

**Interfaces:**
- Consumes: Task 1〜8の全成果物
- Produces: lint / unit / build 全通過の検証済みブランチ

- [ ] **Step 1: CLAUDE.mdのディレクトリ構成に1行追記**

`CLAUDE.md` の features一覧の `└── export-csv/  # CSVエクスポート` の下に追加:

```
│   └── waitlist-lp/ # 需要検証用ウェイトリストLP (/lp、認証不要)
```

（ツリーの罫線は前後の行に合わせて調整する）

- [ ] **Step 2: docs/database.mdにテーブルを追記**

`docs/database.md` のテーブル一覧に `waitlist_entries`（LP経由のウェイトリスト登録。email UNIQUE / price_intent / simulator_used / created_at）を、既存テーブルの記述粒度に合わせて追記する。

- [ ] **Step 3: 全検証を実行**

Run:

```bash
npm run lint && npx vitest run && npm run build
```

Expected: すべて成功（lintエラー0、テスト全件PASS、ビルド成功）

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md docs/database.md
git commit -m "docs: ウェイトリストLPの構成とテーブルをドキュメントに追記"
```

- [ ] **Step 5: デプロイ手順の確認（実施は本番リリース時）**

このブランチのマージ後、本番反映には以下が必要（Vercelデプロイだけでは不足）:

```bash
npx wrangler d1 migrations apply score-splitter --remote   # 0004を適用
npx wrangler deploy                                        # Worker本体を更新
```

Vercel本番デプロイ後、`/lp` が未認証で表示されることと登録が通ることを確認する。
