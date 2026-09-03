# AI家計診断 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 選択月と直前3か月の家計を比較し、夫婦を一つのチームとして扱う、根拠付きのAI家計診断を月次画面へ追加する。

**Architecture:** D1/Worker APIを家計データと診断結果の永続化境界とし、Next.jsのServer Actionが分類・決定的集計・AI文章生成をオーケストレーションする。数値計算と候補抽出は純関数、AIは固定カテゴリ分類と候補IDに対する短い説明だけを担当し、UIは保存済みの検証済み結果を表示する。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zod 4、Cloudflare Worker/D1、OpenAI Responses API、Vitest、Testing Library、MSW、Playwright

**Spec:** `docs/superpowers/specs/2026-09-01-ai-household-diagnosis-design.md`

## Global Constraints

- 診断対象は家庭全体のみとし、`person`を診断集計またはAI入力へ含めない。
- 比較対象は選択月の直前3か月。過去0か月は構成説明、1〜2か月は参考値、3か月は通常診断とする。
- 増加候補は差額3,000円以上かつ増加率20%以上、差額順で最大3件とする。
- `healthcare`、一度きりの高額支出、`other`を断定的な削減候補にしない。
- 金額、平均、増減率、削減余地はアプリ側で計算し、AI応答に数値を生成させない。
- AI入力へレコードID、担当者、収入ラベル、Cookie、認証情報を含めない。
- OpenAI Responses APIは`store: false`、Structured Outputsの`json_schema`と`strict: true`を使用する。
- AI APIキーはサーバー環境だけで保持し、クライアントバンドルやWorker APIレスポンスへ含めない。
- 同一月の同時診断はD1の2分間リースで抑止する。
- TDDで進め、全体カバレッジ80%以上を維持する。
- UI変更後は`npm run dev:mock`とブラウザ操作で通常・データ不足・期限切れ・エラー状態を目視確認する。

## File Structure

### 新規作成

- `src/features/ai-diagnosis/domain.ts`: 固定カテゴリ、ワイヤー型、Zodスキーマ、診断表示型
- `src/features/ai-diagnosis/analyze.ts`: 月範囲、集計、候補抽出、表示用根拠の純関数
- `src/features/ai-diagnosis/input-hash.ts`: 診断入力の正規化とSHA-256指紋
- `src/features/ai-diagnosis/provider.ts`: AIプロバイダー契約とモック実装
- `src/features/ai-diagnosis/openai-provider.ts`: OpenAI Responses APIアダプター
- `src/features/ai-diagnosis/service.ts`: 診断オーケストレーション
- `src/features/ai-diagnosis/index.tsx`: レスポンシブ診断ダイアログと状態管理
- `src/features/ai-diagnosis/components/diagnosis-result.tsx`: 4ブロックの表示専用コンポーネント
- `src/app/actions/ai-diagnosis.ts`: 認証済み取得・実行Server Action
- `src/lib/api/ai-diagnosis.ts`: Worker APIクライアント
- `cloudflare/worker/src/ai-diagnosis-store.ts`: 診断コンテキスト・分類・結果・リースのD1操作
- `cloudflare/worker/migrations/0005_add_ai_diagnosis.sql`: カテゴリ列と診断テーブル
- `tests/unit/features/ai-diagnosis/analyze.test.ts`: 集計・候補抽出テスト
- `tests/unit/features/ai-diagnosis/input-hash.test.ts`: 指紋テスト
- `tests/unit/features/ai-diagnosis/provider.test.ts`: AI入力・構造化応答・再試行テスト
- `tests/unit/cloudflare/ai-diagnosis-store.test.ts`: D1操作とリーステスト
- `tests/integration/actions/ai-diagnosis.test.ts`: Server Actionオーケストレーションテスト
- `tests/components/features/ai-diagnosis.test.tsx`: UI状態テスト
- `tests/e2e/ai-diagnosis.spec.ts`: モック環境の診断フロー
- `tests/e2e/helpers.ts`: 共通ログインヘルパー

### 変更

- `src/features/monthly-overview/index.tsx`: 診断ボタンを月次要約へ配置
- `cloudflare/worker/src/records.ts`: 支出更新時のカテゴリ無効化
- `cloudflare/worker/src/index.ts`: 診断用Worker APIルートを追加
- `cloudflare/worker/src/d1.ts`: 必要なD1結果メタデータの型を維持
- `src/mocks/data.ts`: 4か月比較用データと内部カテゴリを追加
- `src/mocks/db.ts`: `ai_diagnoses`モックテーブルを追加
- `src/mocks/handlers.ts`: 診断用Worker APIハンドラーを追加
- `.env.mock`: 決定的なモックAIプロバイダーを有効化
- `wrangler.jsonc`: 非秘密のAIモデル設定を追加
- `docs/database.md`: カテゴリ列と診断テーブルを追記
- `docs/configuration.md`: OpenAIとモック設定を追記
- `package.json`, `package-lock.json`: 公式`openai` SDKを追加

---

### Task 1: 決定的な診断ドメインと集計エンジン

**Files:**
- Create: `src/features/ai-diagnosis/domain.ts`
- Create: `src/features/ai-diagnosis/analyze.ts`
- Create: `src/features/ai-diagnosis/input-hash.ts`
- Test: `tests/unit/features/ai-diagnosis/analyze.test.ts`
- Test: `tests/unit/features/ai-diagnosis/input-hash.test.ts`

**Interfaces:**
- Consumes: 月・金額・ラベル・繰越状態・内部カテゴリを持つ`DiagnosisContext`
- Produces: `getDiagnosisMonths(month: string): string[]`
- Produces: `buildDiagnosisAnalysis(context: DiagnosisContext): DiagnosisAnalysis`
- Produces: `createDiagnosisInputHash(context: DiagnosisContext): Promise<string>`
- Produces: `composeDiagnosisView(analysis: DiagnosisAnalysis, narrative: AiNarrativeResult): AiDiagnosisView`

- [ ] **Step 1: 固定カテゴリと診断契約の失敗テストを書く**

`tests/unit/features/ai-diagnosis/analyze.test.ts`に、次の入力を用意する。

```typescript
const context: DiagnosisContext = {
  targetMonth: '202604',
  incomes: [
    { month: '202604', amount: 600000 },
  ],
  expenses: [
    { id: 'apr-dining', month: '202604', label: '外食', amount: -48000, isCarryover: false, aiCategory: 'dining' },
    { id: 'mar-dining', month: '202603', label: '外食', amount: -30000, isCarryover: false, aiCategory: 'dining' },
    { id: 'feb-dining', month: '202602', label: '外食', amount: -33000, isCarryover: false, aiCategory: 'dining' },
    { id: 'jan-dining', month: '202601', label: '外食', amount: -33000, isCarryover: false, aiCategory: 'dining' },
    { id: 'apr-health', month: '202604', label: '通院', amount: -20000, isCarryover: false, aiCategory: 'healthcare' },
    { id: 'apr-small', month: '202604', label: '雑貨', amount: -2500, isCarryover: false, aiCategory: 'household' },
    { id: 'apr-deferred', month: '202604', label: '繰越支出', amount: -50000, isCarryover: true, aiCategory: null },
  ],
  carryovers: [
    { month: '202604', amount: -10000, isCleared: false },
  ],
}

it('差額と増減率の両方を満たす増加だけを最大3件抽出する', () => {
  const result = buildDiagnosisAnalysis(context)
  expect(result.notableCandidates).toEqual([
    expect.objectContaining({ id: 'increase:dining', differenceAmount: 16000, differenceRate: 0.5 }),
  ])
})

it('年境界をまたいで対象月と直前3か月を返す', () => {
  expect(getDiagnosisMonths('202601')).toEqual(['202601', '202512', '202511', '202510'])
})

it('医療費と繰越支出を削減候補にしない', () => {
  const result = buildDiagnosisAnalysis(context)
  expect(result.suggestionCandidates).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ category: 'healthcare' })])
  )
  expect(result.currentExpenseTotal).toBe(70500)
})

it('比較3か月中2か月以上で0円のカテゴリを一時支出として削減候補から外す', () => {
  const result = buildDiagnosisAnalysis(oneOffTravelContext)
  expect(result.notableCandidates).toEqual([
    expect.objectContaining({ category: 'travel', isLikelyOneOff: true }),
  ])
  expect(result.suggestionCandidates).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ category: 'travel' })])
  )
})
```

- [ ] **Step 2: 集計テストを実行して失敗を確認する**

Run: `npm run test:run -- tests/unit/features/ai-diagnosis/analyze.test.ts`

Expected: FAIL with `Failed to resolve import "@/features/ai-diagnosis/analyze"`。

- [ ] **Step 3: ドメイン型と固定カテゴリを実装する**

`src/features/ai-diagnosis/domain.ts`へ次の契約を定義する。

```typescript
import { z } from 'zod'

export const AI_CATEGORIES = [
  'groceries', 'dining', 'household', 'housing', 'utilities',
  'communications', 'transportation', 'healthcare', 'clothing_beauty',
  'entertainment', 'subscriptions', 'social_gifts', 'travel', 'other',
] as const

export const aiCategorySchema = z.enum(AI_CATEGORIES)
export type AiCategory = z.infer<typeof aiCategorySchema>
export type DataSufficiency = 'current_only' | 'reference' | 'full'

export interface DiagnosisExpense {
  id: string
  month: string
  label: string
  amount: number
  isCarryover: boolean
  aiCategory: AiCategory | null
}

export interface DiagnosisContext {
  targetMonth: string
  incomes: Array<{ month: string; amount: number }>
  expenses: DiagnosisExpense[]
  carryovers: Array<{ month: string; amount: number; isCleared: boolean }>
}

export interface DiagnosisCandidate {
  id: string
  kind: 'increase' | 'positive' | 'suggestion'
  category: AiCategory
  currentAmount: number
  baselineAmount: number | null
  differenceAmount: number
  differenceRate: number | null
  potentialAmount: number | null
  contributingLabels: string[]
  isLikelyOneOff: boolean
}

export interface AiNarrativeResult {
  summaryText: string
  notableChanges: Array<{ candidateId: string; commentary: string }>
  positivePoints: Array<{ candidateId: string; commentary: string }>
  suggestions: Array<{ candidateId: string; commentary: string }>
  dataSufficiency: DataSufficiency
}

export interface DiagnosisAnalysis {
  targetMonth: string
  currentExpenseTotal: number
  baselineExpenseAverage: number | null
  unresolvedCarryoverTotal: number
  dataSufficiency: DataSufficiency
  notableCandidates: DiagnosisCandidate[]
  positiveCandidates: DiagnosisCandidate[]
  suggestionCandidates: DiagnosisCandidate[]
}

export interface DiagnosisViewItem extends DiagnosisCandidate {
  commentary: string
}

export interface AiDiagnosisView {
  month: string
  summaryText: string
  currentExpenseTotal: number
  baselineExpenseAverage: number | null
  unresolvedCarryoverTotal: number
  notableChanges: DiagnosisViewItem[]
  positivePoints: DiagnosisViewItem[]
  suggestions: DiagnosisViewItem[]
  dataSufficiency: DataSufficiency
}

export interface CategoryAssignment {
  label: string
  category: AiCategory
}

export interface ExpenseCategoryAssignment {
  expenseIds: string[]
  category: AiCategory
}

export type NarrativeInput = DiagnosisAnalysis

export interface SavedDiagnosis {
  diagnosis: AiDiagnosisView
  inputHash: string
  analysisVersion: string
  updatedAt: string
}

export interface DiagnosisSnapshot {
  diagnosis: AiDiagnosisView | null
  stale: boolean
}

export interface SaveDiagnosisInput {
  runToken: string
  inputHash: string
  analysisVersion: string
  diagnosis: AiDiagnosisView
}
```

同じファイルへ`DiagnosisAnalysis`、数値根拠を含む`AiDiagnosisView`、各Zodスキーマを追加する。`AiDiagnosisView`だけをDBの`result_json`とUIの共有契約にする。

- [ ] **Step 4: 集計・候補抽出・表示合成を実装する**

`src/features/ai-diagnosis/analyze.ts`では定数を一元化する。

```typescript
export const DIAGNOSIS_THRESHOLDS = {
  minimumDifference: 3000,
  minimumRate: 0.2,
  maximumNotableChanges: 3,
} as const

export function buildDiagnosisAnalysis(context: DiagnosisContext): DiagnosisAnalysis {
  const actualExpenses = context.expenses.filter((expense) => !expense.isCarryover)
  // 金額は保存上負値なので、集計時だけ絶対値へ変換する。
  // 対象月と、実支出が存在する比較月ごとにカテゴリ合計を作る。
  // 差額・率の二重条件、医療費除外、最大3件をここで確定する。
  return buildAnalysisFromCategoryTotals(context.targetMonth, actualExpenses, context.carryovers)
}
```

`getDiagnosisMonths`は`YYYYMM`を年・月へ分解し、Dateのタイムゾーン変換に依存せず整数演算で年境界を処理する。無効な月には例外を返す。

`composeDiagnosisView`はAIが返した候補IDを許可集合と照合し、未知IDが1つでもあれば例外にする。金額・率・カテゴリは必ず`DiagnosisAnalysis`からコピーし、AI応答から受け取らない。

一時支出は、カテゴリ支出が比較3か月中2か月以上で0円、または当月の単一ラベルがカテゴリ合計の80%以上を占め、そのラベルが比較月に存在しない場合に`isLikelyOneOff: true`とする。過去平均0円でも当月3,000円以上なら増加率NULLの「新規支出」として気になった変化に残せるが、削減余地はNULLとし、来月のヒント候補から除外する。

良かった点は、減少額3,000円以上かつ減少率20%以上を優先する。該当がない場合だけ、当月10,000円以上・比較3か月すべてに実績あり・平均との差10%以内のカテゴリから、当月金額が最大の1件を「安定」候補にする。

- [ ] **Step 5: 入力指紋の失敗テストを書く**

`tests/unit/features/ai-diagnosis/input-hash.test.ts`へ追加する。

```typescript
it('配列順と担当者に依存せず、金額とカテゴリの変更を検出する', async () => {
  const first = await createDiagnosisInputHash(context)
  const reordered = await createDiagnosisInputHash({
    ...context,
    expenses: [...context.expenses].reverse(),
  })
  const changed = await createDiagnosisInputHash({
    ...context,
    expenses: context.expenses.map((expense) =>
      expense.id === 'apr-dining' ? { ...expense, amount: -49000 } : expense
    ),
  })
  expect(reordered).toBe(first)
  expect(changed).not.toBe(first)
})
```

- [ ] **Step 6: SHA-256入力指紋を実装する**

`src/features/ai-diagnosis/input-hash.ts`で、月・種別・ID・ラベル・金額・繰越状態・カテゴリだけを安定ソートして`crypto.subtle.digest('SHA-256', ...)`へ渡す。`person`を引数型にも出力文字列にも含めない。

- [ ] **Step 7: Task 1のテストを通す**

Run: `npm run test:run -- tests/unit/features/ai-diagnosis/analyze.test.ts tests/unit/features/ai-diagnosis/input-hash.test.ts`

Expected: すべてPASS。

- [ ] **Step 8: コミットする**

```bash
git add src/features/ai-diagnosis/domain.ts src/features/ai-diagnosis/analyze.ts src/features/ai-diagnosis/input-hash.ts tests/unit/features/ai-diagnosis
git commit -m "feat: AI家計診断の集計基盤を追加"
```

---

### Task 2: D1スキーマと診断ストア

**Files:**
- Create: `cloudflare/worker/migrations/0005_add_ai_diagnosis.sql`
- Create: `cloudflare/worker/src/ai-diagnosis-store.ts`
- Modify: `cloudflare/worker/src/records.ts`
- Test: `tests/unit/cloudflare/ai-diagnosis-store.test.ts`
- Test: `tests/unit/cloudflare/records.test.ts`

**Interfaces:**
- Consumes: D1の`incomes`、`expenses`、`carryovers`
- Produces: `getDiagnosisContext(db, targetMonth): Promise<DiagnosisContextRow>`
- Produces: `saveExpenseCategories(db, runtime, assignments: StoreCategoryAssignment[]): Promise<void>`
- Produces: `getSavedDiagnosis(db, month): Promise<SavedDiagnosisRow | null>`
- Produces: `acquireDiagnosisLease(db, runtime, month, token): Promise<boolean>`
- Produces: `saveDiagnosis(db, runtime, input): Promise<void>`
- Produces: `releaseDiagnosisLease(db, month, token): Promise<void>`

- [ ] **Step 1: マイグレーション契約とD1操作の失敗テストを書く**

`tests/unit/cloudflare/ai-diagnosis-store.test.ts`にSpy D1を用意し、次を検証する。

```typescript
it('診断コンテキストから担当者を除外する', async () => {
  const result = await getDiagnosisContext(db, '202604')
  expect(result.expenses[0]).toEqual({
    id: 'expense-1', month: '202604', label: '外食', amount: -48000,
    isCarryover: false, aiCategory: null,
  })
  expect(result.expenses[0]).not.toHaveProperty('person')
})

it('有効なリースがある月の取得を拒否する', async () => {
  db.nextRunChanges = 0
  await expect(acquireDiagnosisLease(db, runtime, '202604', 'run-2')).resolves.toBe(false)
})
```

`tests/unit/cloudflare/records.test.ts`には、支出ラベル更新SQLが`ai_category = NULL`、`ai_category_source = NULL`、`ai_categorized_at = NULL`を含むことを追加する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:run -- tests/unit/cloudflare/ai-diagnosis-store.test.ts tests/unit/cloudflare/records.test.ts`

Expected: FAIL because `ai-diagnosis-store.ts` and AI category columns do not exist。

- [ ] **Step 3: D1マイグレーションを実装する**

`0005_add_ai_diagnosis.sql`の主要DDLは次とする。

```sql
ALTER TABLE expenses ADD COLUMN ai_category TEXT NULL
  CHECK (ai_category IS NULL OR ai_category IN ('groceries','dining','household','housing','utilities','communications','transportation','healthcare','clothing_beauty','entertainment','subscriptions','social_gifts','travel','other'));
ALTER TABLE expenses ADD COLUMN ai_category_source TEXT NULL
  CHECK (ai_category_source IS NULL OR ai_category_source = 'ai');
ALTER TABLE expenses ADD COLUMN ai_categorized_at TEXT NULL;

CREATE TABLE ai_diagnoses (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE CHECK (length(month) = 6),
  result_json TEXT NULL,
  input_hash TEXT NULL,
  analysis_version TEXT NULL,
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 4: 診断ストアを実装する**

`cloudflare/worker/src/ai-diagnosis-store.ts`内に、Next.js側の型へ依存しない次の行型を定義する。

```typescript
export interface DiagnosisContextRow {
  targetMonth: string
  incomes: Array<{ month: string; amount: number }>
  expenses: Array<{
    id: string
    month: string
    label: string
    amount: number
    isCarryover: boolean
    aiCategory: string | null
  }>
  carryovers: Array<{ month: string; amount: number; isCleared: boolean }>
}

export interface SavedDiagnosisRow {
  diagnosis: unknown
  inputHash: string
  analysisVersion: string
  updatedAt: string
}

export interface StoreCategoryAssignment {
  expenseIds: string[]
  category: string
}

export interface StoreDiagnosisInput {
  runToken: string
  inputHash: string
  analysisVersion: string
  diagnosis: unknown
}
```

`getDiagnosisContext`は対象月と直前3か月を年境界対応の整数演算で求めて一括取得し、SQLのSELECT句にも`person`を含めない。分類保存は最大100件、許可カテゴリのみを受け、D1`batch`で実行する。`getSavedDiagnosis`は`result_json`がNULLのリース専用行を保存済み診断として返さず、JSON parseした値を`unknown`のままNext.js側のZod検証へ渡す。

リース取得は2分後のISO日時を作り、既存行には次の条件付き更新を使う。

```sql
UPDATE ai_diagnoses
SET run_token = ?, run_expires_at = ?, updated_at = ?
WHERE month = ? AND (run_token IS NULL OR run_expires_at < ?)
```

行がない場合は`INSERT OR IGNORE`し、`meta.changes === 1`だけを取得成功とする。保存・解放は`WHERE month = ? AND run_token = ?`を必須にする。

- [ ] **Step 5: 支出編集時の分類無効化を実装する**

通常の支出APIと`Expense`型には内部カテゴリを追加しない。`updateRecord`の支出更新では更新前レコードを取得し、ラベルが変わった場合だけ`ai_category`、`ai_category_source`、`ai_categorized_at`をNULLへ戻す。金額だけの変更や繰越フラグ切り替えでは分類を保持する。

- [ ] **Step 6: Task 2のテストを通す**

Run: `npm run test:run -- tests/unit/cloudflare/ai-diagnosis-store.test.ts tests/unit/cloudflare/records.test.ts`

Expected: すべてPASS。

- [ ] **Step 7: コミットする**

```bash
git add cloudflare/worker/migrations/0005_add_ai_diagnosis.sql cloudflare/worker/src/ai-diagnosis-store.ts cloudflare/worker/src/records.ts tests/unit/cloudflare/ai-diagnosis-store.test.ts tests/unit/cloudflare/records.test.ts
git commit -m "feat: AI診断データをD1へ保存"
```

---

### Task 3: Worker診断APIとNext.js APIクライアント

**Files:**
- Modify: `cloudflare/worker/src/index.ts`
- Create: `src/lib/api/ai-diagnosis.ts`
- Modify: `tests/unit/cloudflare/worker.test.ts`
- Modify: `tests/integration/api/lib-api-contract.test.ts`

**Interfaces:**
- Consumes: Task 2の診断ストア関数
- Produces: `getDiagnosisContext(month)`、`getSavedDiagnosis(month)`
- Produces: `acquireDiagnosisLease(month, token)`、`saveExpenseCategories(assignments)`
- Produces: `saveDiagnosis(month, input)`、`releaseDiagnosisLease(month, token)`

- [ ] **Step 1: Workerルートの失敗テストを書く**

`tests/unit/cloudflare/worker.test.ts`へ認証込みで次を追加する。

```typescript
it('診断コンテキストを担当者なしで返す', async () => {
  const response = await request('/ai-diagnoses/202604/context', { method: 'GET' })
  expect(response.status).toBe(200)
  const payload = await response.json()
  expect(payload.data.expenses[0]).not.toHaveProperty('person')
})

it('有効な実行リースがある場合は409を返す', async () => {
  await request('/ai-diagnoses/202604/lease', {
    method: 'POST', body: JSON.stringify({ runToken: 'first' }),
  })
  const response = await request('/ai-diagnoses/202604/lease', {
    method: 'POST', body: JSON.stringify({ runToken: 'second' }),
  })
  expect(response.status).toBe(409)
})
```

- [ ] **Step 2: APIクライアント契約の失敗テストを書く**

`tests/integration/api/lib-api-contract.test.ts`で、パス・Bearer認証・JSON body・Zod検証を確認する。診断結果に`person`を混入させたレスポンスはスキーマ変換後も利用しないことを確認する。

- [ ] **Step 3: 失敗を確認する**

Run: `npm run test:run -- tests/unit/cloudflare/worker.test.ts tests/integration/api/lib-api-contract.test.ts`

Expected: 新しいルートが404、APIクライアントimportが解決せずFAIL。

- [ ] **Step 4: Workerルートを追加する**

`cloudflare/worker/src/index.ts`へ、一般的な`/:id`ルートより前に次を追加する。

```text
GET    /ai-diagnoses/:month/context
GET    /ai-diagnoses/:month
POST   /ai-diagnoses/:month/lease
PATCH  /ai-diagnoses/categories
PUT    /ai-diagnoses/:month
DELETE /ai-diagnoses/:month/lease
```

すべて既存のBearer認証後に処理する。月は`parseMonth`、bodyは`assertObject`と個別パーサーで検証し、リース競合だけ409を返す。

- [ ] **Step 5: Zod検証付きAPIクライアントを実装する**

`src/lib/api/ai-diagnosis.ts`は`apiRequest`を再利用し、未知キーを拒否する`.strict()`付きZodスキーマで次の公開契約にする。

```typescript
export async function getDiagnosisContext(month: string): Promise<DiagnosisContext>
export async function getSavedDiagnosis(month: string): Promise<SavedDiagnosis | null>
export async function acquireDiagnosisLease(month: string, runToken: string): Promise<void>
export async function saveExpenseCategories(assignments: ExpenseCategoryAssignment[]): Promise<void>
export async function saveDiagnosis(month: string, input: SaveDiagnosisInput): Promise<AiDiagnosisView>
export async function releaseDiagnosisLease(month: string, runToken: string): Promise<void>
```

- [ ] **Step 6: Task 3のテストを通す**

Run: `npm run test:run -- tests/unit/cloudflare/worker.test.ts tests/integration/api/lib-api-contract.test.ts`

Expected: すべてPASS。

- [ ] **Step 7: コミットする**

```bash
git add cloudflare/worker/src/index.ts src/lib/api/ai-diagnosis.ts tests/unit/cloudflare/worker.test.ts tests/integration/api/lib-api-contract.test.ts
git commit -m "feat: AI診断用Worker APIを追加"
```

---

### Task 4: OpenAI構造化出力アダプター

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/ai-diagnosis/provider.ts`
- Create: `src/features/ai-diagnosis/openai-provider.ts`
- Test: `tests/unit/features/ai-diagnosis/provider.test.ts`

**Interfaces:**
- Consumes: 未分類の正規化ラベル、Task 1の`DiagnosisAnalysis`
- Produces: `AiDiagnosisProvider.classifyLabels(labels): Promise<CategoryAssignment[]>`
- Produces: `AiDiagnosisProvider.generateNarrative(input): Promise<AiNarrativeResult>`
- Produces: `createAiDiagnosisProvider(): AiDiagnosisProvider`

- [ ] **Step 1: 公式OpenAI SDKを追加する**

Run: `npm install openai`

Expected: `package.json`と`package-lock.json`に`openai`が追加される。

- [ ] **Step 2: プロバイダー境界の失敗テストを書く**

`tests/unit/features/ai-diagnosis/provider.test.ts`へ、注入した偽Responsesクライアントで次を検証する。

```typescript
const validNarrativeJson = JSON.stringify({
  summaryText: '外食の変化が目立つ月でした',
  notableChanges: [{ candidateId: 'increase:dining', commentary: '意図した支出だったか振り返れそうです' }],
  positivePoints: [],
  suggestions: [{ candidateId: 'suggestion:dining', commentary: '次の月に回数を話し合う選択肢があります' }],
  dataSufficiency: 'full',
})
const unsafeNarrativeJson = JSON.stringify({
  summaryText: '夫の外食が16,000円増えました',
  notableChanges: [], positivePoints: [], suggestions: [], dataSufficiency: 'full',
})

it('分類入力にはラベルだけを含める', async () => {
  await provider.classifyLabels(['Uber Eats', 'イオン'])
  expect(fakeClient.lastRequest).not.toMatchObject({ person: expect.anything() })
  expect(JSON.stringify(fakeClient.lastRequest)).not.toContain('husband')
})

it('診断応答の未知candidateIdを拒否する', async () => {
  fakeClient.outputText = JSON.stringify({
    summaryText: '振り返り',
    notableChanges: [{ candidateId: 'unknown', commentary: '説明' }],
    positivePoints: [], suggestions: [], dataSufficiency: 'full',
  })
  await expect(provider.generateNarrative(narrativeInput)).rejects.toThrow('候補ID')
})

it('不正な構造化出力を一度だけ再試行する', async () => {
  fakeClient.outputs = ['{', validNarrativeJson]
  await expect(provider.generateNarrative(narrativeInput)).resolves.toBeDefined()
  expect(fakeClient.calls).toBe(2)
})

it('数値と個人評価を含む説明文を拒否する', async () => {
  fakeClient.outputs = [unsafeNarrativeJson, validNarrativeJson]
  await expect(provider.generateNarrative(narrativeInput)).resolves.toBeDefined()
  expect(fakeClient.calls).toBe(2)
})
```

- [ ] **Step 3: 失敗を確認する**

Run: `npm run test:run -- tests/unit/features/ai-diagnosis/provider.test.ts`

Expected: provider modules do not exist and tests FAIL。

- [ ] **Step 4: プロバイダー契約とモック実装を作る**

`provider.ts`に次の契約を定義する。

```typescript
export interface AiDiagnosisProvider {
  classifyLabels(labels: string[]): Promise<CategoryAssignment[]>
  generateNarrative(input: NarrativeInput): Promise<AiNarrativeResult>
}

export function createAiDiagnosisProvider(): AiDiagnosisProvider {
  if (process.env.AI_PROVIDER === 'mock') return new MockAiDiagnosisProvider()
  return createOpenAiDiagnosisProvider({
    apiKey: requiredEnv('OPENAI_API_KEY'),
    classificationModel: requiredEnv('OPENAI_CLASSIFICATION_MODEL'),
    diagnosisModel: requiredEnv('OPENAI_DIAGNOSIS_MODEL'),
  })
}
```

モックはラベルの部分一致辞書で固定カテゴリを返し、候補IDを順番どおり選ぶ決定的実装にする。実データや乱数へ依存させない。

- [ ] **Step 5: Responses APIアダプターを実装する**

`openai-provider.ts`は`new OpenAI({ apiKey, timeout: 15_000, maxRetries: 0 })`を使う。分類・診断とも次の設定を含める。

```typescript
const response = await client.responses.create({
  model,
  store: false,
  input: [
    { role: 'developer', content: systemInstruction },
    { role: 'user', content: JSON.stringify(untrustedData) },
  ],
  text: {
    format: {
      type: 'json_schema',
      name: schemaName,
      strict: true,
      schema: z.toJSONSchema(outputSchema),
    },
  },
})
```

出力は`response.output_text`をJSON parse後にZod検証する。空出力、refusal、不正カテゴリ、未知候補IDを失敗にする。さらに説明文に`0-9`、全角数字、`¥`、`円`、`%`、`夫`、`妻`、`husband`、`wife`、`浪費`、`無駄遣い`が含まれる場合も拒否する。これらの構造・安全性違反だけ一度再試行する。分類は重複除去後100ラベル、各80文字を上限とする。

- [ ] **Step 6: Task 4のテストを通す**

Run: `npm run test:run -- tests/unit/features/ai-diagnosis/provider.test.ts`

Expected: すべてPASS、外部API呼び出し0件。

- [ ] **Step 7: コミットする**

```bash
git add package.json package-lock.json src/features/ai-diagnosis/provider.ts src/features/ai-diagnosis/openai-provider.ts tests/unit/features/ai-diagnosis/provider.test.ts
git commit -m "feat: AI診断のOpenAIアダプターを追加"
```

---

### Task 5: 診断サービスと認証済みServer Action

**Files:**
- Create: `src/features/ai-diagnosis/service.ts`
- Create: `src/app/actions/ai-diagnosis.ts`
- Test: `tests/integration/actions/ai-diagnosis.test.ts`

**Interfaces:**
- Consumes: Task 1の純関数、Task 3のWorker API、Task 4のAIプロバイダー
- Produces: `AiDiagnosisService.load(month): Promise<DiagnosisSnapshot>`
- Produces: `AiDiagnosisService.run(month): Promise<AiDiagnosisView>`
- Produces: `createAiDiagnosisService(deps): AiDiagnosisService`
- Produces: Server Action `loadAiDiagnosis(month): Promise<ActionResult<DiagnosisSnapshot>>`
- Produces: Server Action `generateAiDiagnosis(month): Promise<ActionResult<AiDiagnosisView>>`

`service.ts`では外部依存を次の契約に閉じ込める。

```typescript
export interface AiDiagnosisRepository {
  getContext(month: string): Promise<DiagnosisContext>
  getSavedDiagnosis(month: string): Promise<SavedDiagnosis | null>
  acquireLease(month: string, runToken: string): Promise<void>
  saveCategories(assignments: ExpenseCategoryAssignment[]): Promise<void>
  saveDiagnosis(month: string, input: SaveDiagnosisInput): Promise<AiDiagnosisView>
  releaseLease(month: string, runToken: string): Promise<void>
}

export interface AiDiagnosisServiceDependencies {
  repository: AiDiagnosisRepository
  provider: AiDiagnosisProvider
  randomUUID: () => string
  logReleaseError: (error: unknown) => void
}

export interface AiDiagnosisService {
  load(month: string): Promise<DiagnosisSnapshot>
  run(month: string): Promise<AiDiagnosisView>
}
```

- [ ] **Step 1: オーケストレーションの失敗テストを書く**

依存を注入できる`createAiDiagnosisService(deps)`を前提に、次を検証する。

```typescript
it('未分類ラベルだけ分類し、担当者をAIへ渡さない', async () => {
  const result = await service.run('202604')
  expect(provider.classifyLabels).toHaveBeenCalledWith(['Uber Eats'])
  expect(JSON.stringify(provider.generateNarrative.mock.calls)).not.toContain('husband')
  expect(result.notableChanges[0].differenceAmount).toBe(16000)
})

it('入力指紋が一致する保存済み診断を再利用する', async () => {
  const result = await service.load('202604')
  expect(result).toMatchObject({ stale: false, diagnosis: savedDiagnosis })
  expect(provider.generateNarrative).not.toHaveBeenCalled()
})

it('診断生成失敗時も分類を保持してリースを解放する', async () => {
  provider.generateNarrative.mockRejectedValue(new Error('AI unavailable'))
  await expect(service.run('202604')).rejects.toThrow()
  expect(repository.saveCategories).toHaveBeenCalledOnce()
  expect(repository.releaseLease).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:run -- tests/integration/actions/ai-diagnosis.test.ts`

Expected: service and actions modules do not exist and tests FAIL。

- [ ] **Step 3: 診断サービスを実装する**

`run(month)`の順序を固定する。

```typescript
const runToken = deps.randomUUID()
await repository.acquireLease(month, runToken)
try {
  const context = await repository.getContext(month)
  assertCurrentMonthHasActualExpenses(context)
  const classified = await classifyUnknownLabels(context, provider, repository)
  const inputHash = await createDiagnosisInputHash(classified)
  const saved = await repository.getSavedDiagnosis(month)
  if (saved?.inputHash === inputHash && saved.analysisVersion === 'v1') {
    await repository.releaseLease(month, runToken)
    return saved.diagnosis
  }
  const analysis = buildDiagnosisAnalysis(classified)
  const narrative = await provider.generateNarrative(toNarrativeInput(analysis))
  const diagnosis = composeDiagnosisView(analysis, narrative)
  return await repository.saveDiagnosis(month, {
    runToken, inputHash, analysisVersion: 'v1', diagnosis,
  })
} catch (error) {
  await repository.releaseLease(month, runToken).catch(logReleaseError)
  throw error
}
```

分類保存後はローカルのイミュータブルなcontextへカテゴリを反映する。元の配列・レコードを変更しない。保存済み結果の`inputHash`と現在値が一致すれば`stale: false`、異なれば保存結果を残して`stale: true`を返す。

同じファイル内の補助関数は、`assertCurrentMonthHasActualExpenses(context): void`、`classifyUnknownLabels(context, provider, repository): Promise<DiagnosisContext>`、`toNarrativeInput(analysis): NarrativeInput`の3つに限定する。`classifyUnknownLabels`は正規化ラベルをAI分類結果へ対応させ、同じラベルを持つ未分類支出IDを`ExpenseCategoryAssignment`へ束ねる。

- [ ] **Step 4: Server Actionを実装する**

両Actionの先頭で`requireAuth()`し、月を`isValidMonth`で検証する。409は「診断を実行中です」、データ0件は「診断できる支出データがありません」、その他は「AI診断に失敗しました」へ変換し、サーバーログへ家計明細やAI入力を出さない。

- [ ] **Step 5: Task 5のテストを通す**

Run: `npm run test:run -- tests/integration/actions/ai-diagnosis.test.ts`

Expected: 認証、キャッシュ再利用、期限切れ、部分成功、リース競合を含めすべてPASS。

- [ ] **Step 6: コミットする**

```bash
git add src/features/ai-diagnosis/service.ts src/app/actions/ai-diagnosis.ts tests/integration/actions/ai-diagnosis.test.ts
git commit -m "feat: AI家計診断の実行フローを追加"
```

---

### Task 6: 月次画面の診断UI

**Files:**
- Create: `src/features/ai-diagnosis/index.tsx`
- Create: `src/features/ai-diagnosis/components/diagnosis-result.tsx`
- Modify: `src/features/monthly-overview/index.tsx`
- Create: `tests/components/features/ai-diagnosis.test.tsx`
- Modify: `tests/components/features/monthly-overview.test.tsx`

**Interfaces:**
- Consumes: `loadAiDiagnosis`、`generateAiDiagnosis`、`AiDiagnosisView`
- Produces: `<AiDiagnosisDialog month: string hasActualExpenses: boolean />`
- Produces: `<DiagnosisResult diagnosis: AiDiagnosisView stale: boolean />`

- [ ] **Step 1: UI状態の失敗テストを書く**

`tests/components/features/ai-diagnosis.test.tsx`でActionをmockし、次を検証する。

```typescript
it('保存済み診断を4ブロックと数値根拠で表示する', async () => {
  render(<AiDiagnosisDialog month="202604" hasActualExpenses />)
  await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
  expect(await screen.findByText('今月のまとめ')).toBeInTheDocument()
  expect(screen.getByText('気になった変化')).toBeInTheDocument()
  expect(screen.getByText('良かった点')).toBeInTheDocument()
  expect(screen.getByText('来月のヒント')).toBeInTheDocument()
  expect(screen.getByText('過去平均より16,000円増')).toBeInTheDocument()
})

it('期限切れ診断を残して再診断を促す', async () => {
  loadAiDiagnosisMock.mockResolvedValue({ success: true, data: { diagnosis, stale: true } })
  render(<AiDiagnosisDialog month="202604" hasActualExpenses />)
  await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
  expect(await screen.findByText(/家計データが更新されています/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '最新データで再診断' })).toBeInTheDocument()
})
```

空データ時のdisabled、初回生成、3段階の進行表示、409、一般エラー、再実行成功、フォーカス復帰も追加する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:run -- tests/components/features/ai-diagnosis.test.tsx tests/components/features/monthly-overview.test.tsx`

Expected: component importが解決せずFAIL。

- [ ] **Step 3: 表示専用コンポーネントを実装する**

`DiagnosisResult`はAI文章をプレーンテキストとして描画し、HTMLとして解釈しない。数値根拠は`formatCurrency`とアプリ側の`differenceRate`から別要素で表示する。未清算繰越がある場合は合計額を「確認事項」として表示し、使いすぎとは表現しない。候補が空ならセクションごと隠し、全候補が空の場合は「今月は大きな変化はありません」を表示する。

- [ ] **Step 4: レスポンシブダイアログを実装する**

既存`ResponsiveModal`を使い、Sparklesアイコン付き44px以上のボタンを設置する。open時だけ保存済み診断を取得し、未保存なら説明と「診断を始める」を表示する。実行中は閉じてもActionをキャンセルせず、重複実行ボタンをdisabledにする。

- [ ] **Step 5: 月次要約へ組み込む**

`MonthlyOverview`のコピー・CSV操作と同じアクション群に配置する。

```tsx
<AiDiagnosisDialog
  month={currentMonth}
  hasActualExpenses={expenses.some((expense) => !expense.isCarryover)}
/>
```

既存テストでは`@/features/ai-diagnosis`をmockし、アクション順と日本語ラベルを確認する。

- [ ] **Step 6: コンポーネントテストを通す**

Run: `npm run test:run -- tests/components/features/ai-diagnosis.test.tsx tests/components/features/monthly-overview.test.tsx tests/components/a11y/aria-attributes.test.tsx`

Expected: すべてPASS。

- [ ] **Step 7: コミットする**

```bash
git add src/features/ai-diagnosis src/features/monthly-overview/index.tsx tests/components/features/ai-diagnosis.test.tsx tests/components/features/monthly-overview.test.tsx
git commit -m "feat: 月次画面にAI家計診断を追加"
```

---

### Task 7: モック、E2E、設定ドキュメント、最終検証

**Files:**
- Modify: `.env.mock`
- Modify: `src/mocks/data.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/handlers.ts`
- Create: `tests/e2e/ai-diagnosis.spec.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `wrangler.jsonc`
- Modify: `docs/database.md`
- Modify: `docs/configuration.md`

**Interfaces:**
- Consumes: Task 3のWorker API、Task 4の`AI_PROVIDER=mock`、Task 6のUI
- Produces: 外部AIなしで通常・不足・期限切れ・エラーを再現できる`dev:mock`環境

- [ ] **Step 1: モック診断E2Eの失敗テストを書く**

`tests/e2e/ai-diagnosis.spec.ts`へ追加する。

```typescript
test('4か月データから家庭全体の診断を生成して再表示する', async ({ page }) => {
  await login(page)
  await page.goto('/2026/02')
  await page.getByRole('button', { name: 'AIで今月を振り返る' }).click()
  await page.getByRole('button', { name: '診断を始める' }).click()
  await expect(page.getByText('今月のまとめ')).toBeVisible()
  await expect(page.getByText('良かった点')).toBeVisible()
  await expect(page.getByText(/夫の支出|妻の支出/)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'AIで今月を振り返る' }).click()
  await expect(page.getByText('今月のまとめ')).toBeVisible()
})
```

`tests/e2e/helpers.ts`へ既存E2Eと同じログイン手順を共通化する。

```typescript
import type { Page } from '@playwright/test'

export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('パスワード').fill('password')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.waitForURL(/\/\d{4}$/)
}
```

- [ ] **Step 2: モックデータとWorkerハンドラーを実装する**

`.env.mock`へ`AI_PROVIDER=mock`を追加する。`src/mocks/data.ts`には2025年11月〜2026年2月の比較可能な支出を用意し、2月の外食だけ差額3,000円・20%を超えるようにする。

`src/mocks/db.ts`へ`ai_diagnoses`を追加し、`src/mocks/handlers.ts`にTask 3と同じ6エンドポイントを実装する。リース競合と保存結果再利用もインメモリDB上で再現する。

- [ ] **Step 3: 本番設定とドキュメントを更新する**

`wrangler.jsonc`の非秘密varsへ次を追加する。

```jsonc
"AI_PROVIDER": "openai",
"OPENAI_CLASSIFICATION_MODEL": "gpt-5-mini-2025-08-07",
"OPENAI_DIAGNOSIS_MODEL": "gpt-5-mini-2025-08-07"
```

`OPENAI_API_KEY`は`wrangler secret put OPENAI_API_KEY`で設定し、JSONへ書かない。`docs/configuration.md`にローカル・本番・モック設定、`store: false`、API組織側のデータ保持設定を記載する。`docs/database.md`に`ai_category*`列、`ai_diagnoses`、2分リース、分類無効化条件を追記する。

- [ ] **Step 4: 自動テストを段階的に実行する**

Run: `npm run lint`

Expected: 0 errors。

Run: `npm run test:coverage`

Expected: 全テストPASS、statements/branches/functions/linesが各80%以上。

Run: `npm run build`

Expected: production build succeeds。

- [ ] **Step 5: モックブラウザで目視検証する**

Run: `npm run dev:mock`

Playwrightで`password`を使ってログインし、次を確認する。

1. `/2026/02`で初回診断を実行し、ローディング、4ブロック、金額根拠を確認
2. ダイアログを閉じて再度開き、保存結果が即時表示されることを確認
3. 支出を編集後、期限切れメッセージと再診断ボタンを確認
4. 実支出0件の月で診断ボタンがdisabledになることを確認
5. 390×844と1440×900でレイアウト、スクロール、44pxタッチ領域を確認
6. ライト・ダーク両テーマのスクリーンショットを保存して目視確認

- [ ] **Step 6: Playwright E2Eを実行する**

Run: `npm run test:e2e -- tests/e2e/ai-diagnosis.spec.ts`

Expected: 初回診断、保存結果再表示、夫婦比較禁止を含めすべてPASS。

- [ ] **Step 7: セキュリティ自己レビューを行う**

次の検索結果が0件または意図したサーバー設定ファイルだけであることを確認する。

```bash
rg -n "OPENAI_API_KEY" src --glob '*.tsx'
rg -n "person|husband|wife" src/features/ai-diagnosis/openai-provider.ts
rg -n "dangerouslySetInnerHTML" src/features/ai-diagnosis
```

OpenAIへの送信payloadをテストでスナップショット化し、担当者、収入ラベル、ID、認証情報が含まれないことを再確認する。

- [ ] **Step 8: 最終コミットを作る**

```bash
git add .env.mock src/mocks/data.ts src/mocks/db.ts src/mocks/handlers.ts tests/e2e/ai-diagnosis.spec.ts tests/e2e/helpers.ts wrangler.jsonc docs/database.md docs/configuration.md
git commit -m "test: AI家計診断のモックとE2Eを追加"
```

- [ ] **Step 9: ブランチ全体を確認する**

Run: `git diff main...HEAD --check`

Expected: 出力なし。

Run: `git status --short`

Expected: ユーザー所有の既存`refactor-instructions.md`以外に未コミット変更なし。

## 参考資料

- [OpenAI Developer quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [OpenAI Responses API: JSON schema response format](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
