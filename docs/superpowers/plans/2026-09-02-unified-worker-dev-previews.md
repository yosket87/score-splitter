# Worker一本化とPRプレビュー開発環境 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.jsとD1アクセスを1つのCloudflare Workerへ統合し、`score-splitter-dev` のPRブランチPreview Versionが開発専用D1を使う環境を構築する。

**Architecture:** 既存の `src/lib/api/*` の公開関数を移行用データアクセスポートとして維持し、通常実行では `getCloudflareContext().env.DB` と既存D1操作関数を直接結ぶ。`USE_MOCKS=true` のE2Eだけ既存HTTP/MSW経路を残し、本番の旧API Workerは安定確認までロールバック用に維持する。

**Tech Stack:** Next.js 16.2.10、React 19.2.3、TypeScript 5.9.3、`@opennextjs/cloudflare` 1.20.1、Cloudflare Workers、D1、Wrangler 4.107.0、Vitest 4、Playwright 1.58.1、MSW 2.12.9

**Spec:** `docs/superpowers/specs/2026-09-02-unified-worker-dev-previews-design.md`

## Global Constraints

- 開発Cloudflare Workerは `score-splitter-dev` の1つだけとし、開発用API Workerを作らない。
- 開発D1は `score-splitter-db-dev` とし、本番D1 UUID `7f8d3531-a833-4474-84d5-cee3ac98ee96` をdev bindingへ設定しない。
- 固定の開発Custom Domainは作らず、Workers BuildsのPRブランチPreview URLを使う。
- PRプレビューではパスワードログインを使い、パスキー登録・ログインは確認対象外とする。
- 本番の `WEBAUTHN_RP_ID=yamawake.app`、`WEBAUTHN_RP_ORIGIN=https://app.yamawake.app`、ホストルーティングを変更しない。
- `cloudflare/worker/migrations/0001_initial.sql` から `0004_add_waitlist_entries.sql` は変更しない。
- Server Actionsの公開シグネチャ、Zod検証、支出・繰越の負数化、認証順序、Cookie、再検証、ユーザー向け固定エラー文言を変更しない。
- `src/middleware.ts` にD1アクセスを追加しない。
- `USE_MOCKS=true` のPlaywright E2Eと `/api/mock/reset` は維持する。
- 旧本番API Worker、`api.yamawake.app`、共有Bearer設定、API用ソースは初回リリースで削除しない。
- 本番D1への操作と本番一本化デプロイは、Time Travel復元地点・全量SQL・SHA-256・件数manifest・ローカル復元検証が揃うまで実行しない。
- 本番バックアップはworktree外の `~/Documents/Backups/score-splitter/d1/` に保存し、Gitへ追加しない。
- D1 Time Travelのrestoreはユーザーの明示承認なしでは実行しない。
- 新規production関数はRED → GREEN → REFACTORで追加し、statements / branches / functions / linesの全てで80%以上を維持する。
- ユーザー所有の未追跡 `refactor-instructions.md` を編集・追加・削除・コミットしない。

---

### Task 1: D1直接アクセス基盤

**Files:**
- Create: `src/lib/api/backend.ts`
- Create: `tests/unit/lib/api/backend.test.ts`

**Interfaces:**
- Consumes: `getCloudflareContext()`、`D1DatabaseLike`、`Runtime`、`createRuntime()`
- Produces: `isWorkerApiMockEnabled(): boolean`、`getDatabase(): D1DatabaseLike`、`getRuntime(): Runtime`

- [ ] **Step 1: 依存関係を準備しベースラインを記録する**

Run:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:run
```

Expected: `npm ci` が成功し、3検証の件数と成否をTask reportへ記録する。失敗があれば今回の変更前から存在するかを確認し、productionコードを触る前に報告する。

- [ ] **Step 2: backendポートの失敗テストを書く**

`tests/unit/lib/api/backend.test.ts` に以下の振る舞いをテストする。

```typescript
vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

it('通常環境ではCloudflareコンテキストのDB bindingを返す', () => {
  vi.stubEnv('USE_MOCKS', 'false')
  vi.mocked(getCloudflareContext).mockReturnValue({ env: { DB: fakeDb } } as never)
  expect(getDatabase()).toBe(fakeDb)
})

it('USE_MOCKS=trueのときだけWorker APIモックを使う', () => {
  vi.stubEnv('USE_MOCKS', 'true')
  expect(isWorkerApiMockEnabled()).toBe(true)
})
```

`afterEach` で `vi.unstubAllEnvs()` と `vi.clearAllMocks()` を実行し、環境変数をテスト間で共有しない。

- [ ] **Step 3: REDを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/backend.test.ts
```

Expected: `@/lib/api/backend` が存在しないためFAILする。

- [ ] **Step 4: 最小実装を追加する**

`src/lib/api/backend.ts` は次の責務だけを持つ。

```typescript
import 'server-only'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  createRuntime,
  type D1DatabaseLike,
  type Runtime,
} from '../../../cloudflare/worker/src/d1'

export function isWorkerApiMockEnabled(): boolean {
  return process.env.USE_MOCKS === 'true'
}

export function getDatabase(): D1DatabaseLike {
  return getCloudflareContext().env.DB
}

export function getRuntime(): Runtime {
  return createRuntime()
}
```

`getCloudflareContext()` は関数内でのみ呼び、モジュールトップレベルでbindingを取得しない。

- [ ] **Step 5: GREENと型を確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/backend.test.ts
npm run typecheck
```

Expected: 新規テストと型チェックがPASSする。`CloudflareEnv` に `DB` が無いため型生成が必要な場合はTask 4のconfig変更前に手書きで型を偽装せず、`cloudflare-env.d.ts` の更新をTask 4へ延期して `env.DB as D1DatabaseLike` の局所キャストを使用する。

- [ ] **Step 6: コミットする**

```bash
git add src/lib/api/backend.ts tests/unit/lib/api/backend.test.ts
git commit -m "feat: D1直接アクセス基盤を追加"
```

---

### Task 2: 家計・月次・ウェイトリストをD1直接アクセスへ切り替える

**Files:**
- Modify: `src/lib/api/records.ts`
- Modify: `src/lib/api/monthly-summary.ts`
- Modify: `src/lib/api/copy-month.ts`
- Modify: `src/lib/api/waitlist.ts`
- Create: `tests/unit/lib/api/direct-records.test.ts`
- Create: `tests/unit/lib/api/direct-misc.test.ts`
- Modify: `tests/integration/api/lib-api-contract.test.ts`

**Interfaces:**
- Consumes: Task 1の `isWorkerApiMockEnabled()`、`getDatabase()`、`getRuntime()`、既存の `cloudflare/worker/src/records.ts`、`copy-month.ts`、`waitlist.ts`
- Produces: 既存と同じ全export。通常環境はD1直接、`USE_MOCKS=true` は既存 `apiRequest()`

- [ ] **Step 1: records直接経路の失敗テストを書く**

`tests/unit/lib/api/direct-records.test.ts` でbackendとWorker D1関数をモックし、以下を1ケースずつ固定する。

```typescript
it('通常環境の月別収入取得はHTTPではなくD1操作を呼ぶ', async () => {
  vi.mocked(isWorkerApiMockEnabled).mockReturnValue(false)
  vi.mocked(getDatabase).mockReturnValue(fakeDb)
  vi.mocked(listRecordsByMonth).mockResolvedValue([income])

  await expect(getIncomesByMonth('202609')).resolves.toEqual([income])
  expect(listRecordsByMonth).toHaveBeenCalledWith(fakeDb, 'income', '202609')
  expect(apiRequest).not.toHaveBeenCalled()
})
```

作成、更新、削除、支出carryover更新、繰越cleared更新について、`getRuntime()` が必要な操作だけRuntimeを渡すことを検証する。支出・繰越の入力amountは負数のままD1操作へ渡ることを固定する。

- [ ] **Step 2: recordsのREDを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-records.test.ts
```

Expected: 現在は常に `apiRequest()` を呼ぶため、D1操作が呼ばれずFAILする。

- [ ] **Step 3: recordsへ直接経路を実装する**

各公開関数の先頭で `isWorkerApiMockEnabled()` を判定する。trueなら既存HTTP処理をそのまま実行し、falseなら以下へ委譲する。

```text
getIncomesByMonth      → listRecordsByMonth(db, 'income', month)
createIncome           → createRecord(db, runtime, 'income', input)
updateIncome           → updateRecord(db, runtime, 'income', id, input)
deleteIncome           → deleteRecord(db, 'income', id)
getExpensesByMonth     → listRecordsByMonth(db, 'expense', month)
createExpense          → createRecord(db, runtime, 'expense', input)
updateExpense          → updateRecord(db, runtime, 'expense', id, input)
toggleExpenseCarryover → patchRecordFlag(db, runtime, 'expense', id, { isCarryover })
deleteExpense          → deleteRecord(db, 'expense', id)
getCarryoversByMonth   → listRecordsByMonth(db, 'carryover', month)
createCarryover        → createRecord(db, runtime, 'carryover', input)
updateCarryover        → updateRecord(db, runtime, 'carryover', id, input)
toggleCarryoverCleared → patchRecordFlag(db, runtime, 'carryover', id, { isCleared })
deleteCarryover        → deleteRecord(db, 'carryover', id)
```

既存export名と戻り値型を変えない。既存HTTP用Zod schemaはmock経路の契約検証に残す。

- [ ] **Step 4: recordsのGREENを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-records.test.ts tests/integration/actions/income.test.ts tests/integration/actions/expense.test.ts tests/integration/actions/carryover.test.ts
```

Expected: 全件PASSする。

- [ ] **Step 5: 月次・コピー・waitlistの失敗テストを書く**

`tests/unit/lib/api/direct-misc.test.ts` に以下を追加する。

```text
getMonthlyAmounts()       → listMonthlyAmounts(db)
getCopyMonthPreview(a,b)  → getCopyMonthPreview(db,a,b)
copyMonthData(options)    → copyMonthData(db,runtime,options)
registerWaitlist(input)   → registerWaitlistEntry(db,runtime,input)
```

各ケースで `apiRequest` が呼ばれないことを検証する。waitlistの戻り値は既存公開契約どおり `void` のままとする。

- [ ] **Step 6: 月次・コピー・waitlistのREDを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-misc.test.ts
```

Expected: 現在はHTTP処理のみなのでFAILする。

- [ ] **Step 7: 月次・コピー・waitlistへ直接経路を実装する**

Worker側と同名関数はimport aliasを使い、公開exportとの自己再帰を防ぐ。

```typescript
import { copyMonthData as copyMonthDataInD1 } from '../../../cloudflare/worker/src/copy-month'
import { registerWaitlistEntry } from '../../../cloudflare/worker/src/waitlist'
```

通常環境ではTask 1のDB/Runtimeを渡す。`USE_MOCKS=true` では既存HTTP、Zod response schema、レスポンスEnvelope処理を維持する。

- [ ] **Step 8: mock HTTP契約を明示してGREENを確認する**

`tests/integration/api/lib-api-contract.test.ts` のsetupで次を追加し、HTTP契約テストが明示的にmock経路を検証するようにする。

```typescript
vi.stubEnv('USE_MOCKS', 'true')
```

teardownの `vi.unstubAllEnvs()` は維持する。

Run:

```bash
npx vitest run tests/unit/lib/api/direct-misc.test.ts tests/integration/api/lib-api-contract.test.ts tests/integration/actions/monthly-summary.test.ts tests/integration/actions/copy-month.test.ts tests/integration/actions/waitlist.test.ts
```

Expected: 全件PASSする。

- [ ] **Step 9: コミットする**

```bash
git add src/lib/api/records.ts src/lib/api/monthly-summary.ts src/lib/api/copy-month.ts src/lib/api/waitlist.ts tests/unit/lib/api/direct-records.test.ts tests/unit/lib/api/direct-misc.test.ts tests/integration/api/lib-api-contract.test.ts
git commit -m "refactor: 家計データをD1直接アクセスへ切り替え"
```

---

### Task 3: セッション・レート制限・パスキーをD1直接アクセスへ切り替える

**Files:**
- Modify: `src/lib/api/sessions.ts`
- Modify: `src/lib/api/login-attempts.ts`
- Modify: `src/lib/api/passkeys.ts`
- Create: `tests/unit/lib/api/direct-auth.test.ts`

**Interfaces:**
- Consumes: Task 1のbackend関数、既存の `sessions.ts`、`login-attempts.ts`、`passkeys.ts`、`challenges.ts`
- Produces: 既存と同じ認証系export。通常環境はD1直接、`USE_MOCKS=true` は既存HTTP

- [ ] **Step 1: セッション・レート制限の失敗テストを書く**

`tests/unit/lib/api/direct-auth.test.ts` で、通常環境では以下へ委譲し `apiRequest` を呼ばないことを検証する。

```text
createSession(input)             → createSession(db,runtime,input)
getSession(token)                → getSession(db,token)
deleteSession(token)             → deleteSession(db,token)
checkLoginRateLimit(key)         → checkLoginRateLimit(db,runtime,{ key })
recordFailedLoginAttempt(key)    → recordFailedLoginAttempt(db,runtime,{ key })
resetLoginAttempts(key)          → resetLoginAttempts(db,{ key })
```

- [ ] **Step 2: 認証前半のREDを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-auth.test.ts
```

Expected: D1関数が呼ばれずFAILする。

- [ ] **Step 3: セッション・レート制限の直接経路を実装する**

Worker側関数には `...InD1` aliasを付ける。ログイン試行制限のキーは既存どおり `{ key }` に包み、時刻計算を変えない。`src/app/actions/auth.ts` の「rate limit check → bcrypt → failure記録またはreset」の順序を変更しない。

- [ ] **Step 4: 認証前半のGREENを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-auth.test.ts tests/unit/lib/webauthn/session.test.ts tests/integration/actions/auth.test.ts
```

Expected: 全件PASSする。

- [ ] **Step 5: パスキー・challengeの失敗テストを追加する**

同じテストファイルへ以下の対応を追加する。

```text
listPasskeys(person)             → listPasskeys(db,person)
getPasskey(id)                   → getPasskey(db,id)
createPasskey(input)             → createPasskey(db,runtime,input)
updatePasskeyCounter(id,counter) → updatePasskeyCounter(db,id,{ counter })
deletePasskey(id)                → deletePasskey(db,id)
createChallenge(input)           → createChallenge(db,runtime,input)
getLatestChallenge(input)        → parseChallengeType(input.type) + getLatestChallenge(db,type,person)
deleteChallenges(input)          → parseChallengeType(input.type) + deleteChallenges(db,type,person)
deleteExpiredChallenges(before)  → deleteExpiredChallenges(db,before)
```

nullableなpasskey/challenge、空transports、counter更新の戻り値契約を維持する。

- [ ] **Step 6: パスキーのREDを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-auth.test.ts
```

Expected: 追加ケースがD1関数未呼び出しでFAILする。

- [ ] **Step 7: パスキー・challengeの直接経路を実装する**

通常環境ではD1関数へ委譲し、`USE_MOCKS=true` では既存HTTPとZod schema検証を残す。`@simplewebauthn/server`、Cookie、redirectは `src/app/actions/passkeys.ts` と `src/lib/webauthn/session.ts` に残し、D1ポートへ移動しない。

- [ ] **Step 8: 認証全体のGREENを確認する**

Run:

```bash
npx vitest run tests/unit/lib/api/direct-auth.test.ts tests/unit/lib/webauthn/session.test.ts tests/integration/actions/auth.test.ts tests/integration/actions/passkeys.test.ts tests/integration/mocks/passkeys-handler.test.ts
```

Expected: 全件PASSする。

- [ ] **Step 9: コミットする**

```bash
git add src/lib/api/sessions.ts src/lib/api/login-attempts.ts src/lib/api/passkeys.ts tests/unit/lib/api/direct-auth.test.ts
git commit -m "refactor: 認証データをD1直接アクセスへ切り替え"
```

---

### Task 4: 開発D1とPRプレビュー用Wrangler環境

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `package.json`
- Modify: `cloudflare-env.d.ts`
- Create: `tests/unit/cloudflare/wrangler-config.test.ts`

**Interfaces:**
- Consumes: Task 1〜3の通常環境D1直接アクセス、既存D1 migration 0001〜0004
- Produces: rootの本番 `DB` binding、`env.dev` の `score-splitter-dev` と開発D1 binding、`deploy:dev` / `upload:dev` / `migrate:dev` scripts

- [ ] **Step 1: Wrangler設定の失敗テストを書く**

コメントを許容してJSONCを読むため、テストではWrangler同梱の設定schemaを再実装せず、ファイルテキスト上の安全不変条件を確認する。

```typescript
it('dev Workerは本番と異なるD1へbindingされる', () => {
  expect(config.env.dev.name).toBe('score-splitter-dev')
  expect(config.env.dev.routes).toEqual([])
  expect(config.env.dev.d1_databases[0].binding).toBe('DB')
  expect(config.env.dev.d1_databases[0].database_name).toBe('score-splitter-db-dev')
  expect(config.env.dev.d1_databases[0].database_id).not.toBe(PRODUCTION_D1_ID)
})
```

JSONC parserを新規依存に追加しない。既存Wrangler packageが公開する設定読込APIがテストから安定利用できない場合は、コメント行を除去できるテスト用の最小関数をテストファイル内だけに置く。

- [ ] **Step 2: configのREDを確認する**

Run:

```bash
npx vitest run tests/unit/cloudflare/wrangler-config.test.ts
```

Expected: `env.dev` とroot `DB` bindingが存在しないためFAILする。

- [ ] **Step 3: 開発D1を作成する**

Run:

```bash
npx wrangler d1 create score-splitter-db-dev --location apac
```

Expected: Cloudflareが新しいD1 UUIDを返す。実行前に同名DBが存在しないことを `npx wrangler d1 list` で確認し、存在する場合は新規作成せずそのUUIDを使う。返されたUUIDをTask reportへ記録する。

- [ ] **Step 4: root Wrangler設定を更新する**

トップレベルへ本番D1 bindingを追加する。

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "score-splitter",
    "database_id": "7f8d3531-a833-4474-84d5-cee3ac98ee96",
    "migrations_dir": "cloudflare/worker/migrations"
  }
]
```

`env.dev` は次を満たすよう追加する。

```jsonc
"env": {
  "dev": {
    "name": "score-splitter-dev",
    "compatibility_flags": ["nodejs_compat"],
    "routes": [],
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "score-splitter-db-dev",
        "database_id": "<開発D1作成時に返された実UUID>",
        "migrations_dir": "cloudflare/worker/migrations"
      }
    ],
    "vars": {
      "WEBAUTHN_RP_ID": "yamawake.app",
      "WEBAUTHN_RP_ORIGIN": "https://app.yamawake.app",
      "WEBAUTHN_RP_NAME": "ヤマワケ",
      "NEXT_PUBLIC_SITE_URL": "https://yamawake.app"
    }
  }
}
```

上記の山括弧部分を設定へコピーしてはならない。Step 3のコマンド出力にあるUUIDを検算し、その実値だけを `database_id` として記載する。

トップレベルの `CLOUDFLARE_WORKER_API_URL` と `global_fetch_strictly_public` は本番ロールバック用に残す。devにはAPI URLを定義しない。

- [ ] **Step 5: scriptsを追加して型を生成する**

`package.json` に次を追加する。

```json
"deploy:dev": "opennextjs-cloudflare build --env dev && opennextjs-cloudflare deploy --env dev",
"upload:dev": "opennextjs-cloudflare build --env dev && opennextjs-cloudflare upload --env dev",
"migrate:dev": "wrangler d1 migrations apply score-splitter-db-dev --remote --env dev"
```

Run:

```bash
npm run cf-typegen
```

Expected: `CloudflareEnv` に `DB` が生成され、Task 1の局所キャストを除去できる。

- [ ] **Step 6: configのGREENとdry-runを確認する**

Run:

```bash
npx vitest run tests/unit/cloudflare/wrangler-config.test.ts
npx opennextjs-cloudflare build --env dev
npx wrangler versions upload --env dev --dry-run --outdir /tmp/score-splitter-dev-dry-run
```

Expected: 設定テストがPASSし、dry-run出力のWorker名が `score-splitter-dev`、binding `DB` が `score-splitter-db-dev` を指す。本番D1 UUIDがdev bindingとして表示されない。

- [ ] **Step 7: 開発D1へmigrationを適用する**

Run:

```bash
npm run migrate:dev
npx wrangler d1 migrations list score-splitter-db-dev --remote --env dev
```

Expected: 0001〜0004が適用済みで、未適用migrationが0件になる。実行対象に本番DB名 `score-splitter` が表示された場合は実行を中止する。

- [ ] **Step 8: コミットする**

```bash
git add wrangler.jsonc package.json cloudflare-env.d.ts tests/unit/cloudflare/wrangler-config.test.ts
git commit -m "feat: PRプレビュー用Cloudflare開発環境を追加"
```

---

### Task 5: ドキュメント・全体検証・PRプレビュー設定

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/database.md`
- Modify: `docs/configuration.md`
- Modify: `docs/deployment.md`
- Modify: `docs/tech-stack.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1〜4のD1直接アクセス、`score-splitter-dev`、`score-splitter-db-dev`、dev scripts
- Produces: 一本化後の開発・本番構成、手動操作、Workers Builds設定、ロールバック手順の正本

- [ ] **Step 1: ドキュメント整合テストの対象を確認する**

Run:

```bash
rg -n "Worker API|score-splitter-api|CLOUDFLARE_WORKER_API|deploy:worker|api.yamawake.app|2ファイル構成" AGENTS.md docs README.md
```

Expected: 更新対象の全記述をTask reportへ列挙する。旧API Workerをロールバック用に残す記述と、通常データ経路として記述している箇所を区別する。

- [ ] **Step 2: ドキュメントを更新する**

以下を明記する。

```text
通常データ経路: Next.js Server Actions → root Worker DB binding → D1
dev Worker: score-splitter-dev
dev D1: score-splitter-db-dev
PR Preview: Workers Builds non-production branch → upload:dev
Preview認証: パスワードのみ。パスキーは対象外
dev migration: npm run migrate:dev
本番API Worker: 安定確認までロールバック用に維持
本番ロールバック: score-splitter-webを旧Versionへ戻す
```

旧API Workerの設定ファイル・deployコマンドを「現在の通常運用」として案内せず、「移行期間中の切り戻し専用」として記述する。

- [ ] **Step 3: ドキュメントコミットを作る**

```bash
git add AGENTS.md docs/README.md docs/architecture.md docs/database.md docs/configuration.md docs/deployment.md docs/tech-stack.md
git commit -m "docs: Worker一本化とPRプレビュー運用を反映"
```

- [ ] **Step 4: 全自動検証を新鮮な状態で実行する**

Run:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:coverage
npm run build
npm run test:e2e
npm run preview
```

Expected: 全コマンドexit 0。Vitest coverageはstatements / branches / functions / linesが各80%以上。Playwrightは全シナリオPASS。OpenNext previewは `DB` bindingを認識して起動する。

- [ ] **Step 5: 直接D1化の静的確認を行う**

Run:

```bash
rg -n "CLOUDFLARE_WORKER_API_URL|CLOUDFLARE_WORKER_API_TOKEN" src --glob '!src/mocks/**'
rg -n "apiRequest" src/lib/api
git diff --check origin/main...HEAD
```

Expected: API環境変数のproduction runtime参照は `src/lib/api/client.ts` のテスト専用mock経路だけ。すべての公開データ関数が通常環境でD1経路を持つ。diff whitespace errorは0件。

- [ ] **Step 6: `score-splitter-dev` の基準Versionをデプロイする**

Run:

```bash
npm run deploy:dev
```

Expected: デプロイ先が `score-splitter-dev`、binding先が `score-splitter-db-dev` と表示される。本番Worker `score-splitter-web` がデプロイ先として表示された場合は確認を拒否して中止する。

- [ ] **Step 7: dev専用パスワードシークレットを設定する**

Run:

```bash
npx wrangler secret put APP_PASSWORD_HASH_BASE64 --env dev
```

Expected: 本番パスワードを再利用せず、ユーザーが管理するdev専用bcrypt hashを対話入力し、対象Workerが `score-splitter-dev` と表示される。シークレット値をログ、Task report、コミットへ記録しない。

- [ ] **Step 8: Workers BuildsをPRプレビュー用に設定する**

`score-splitter-dev` を本番 `score-splitter-web` とは別のWorkers Buildsプロジェクトとして同じGitHubリポジトリへ接続し、次を設定する。

```text
Root directory: /
Production build command: npx opennextjs-cloudflare build --env dev
Production deploy command: npx opennextjs-cloudflare deploy --env dev
Non-production build command: npx opennextjs-cloudflare build --env dev
Non-production deploy command: npx opennextjs-cloudflare upload --env dev
Production branch: main
Non-production branch builds: enabled
Build variable NEXT_PUBLIC_SITE_URL: https://yamawake.app
```

Preview triggerへ本番D1 UUIDや本番シークレットを設定しない。

- [ ] **Step 9: PRを作成してブランチPreviewを確認する**

Run:

```bash
git push -u origin feature/create-dev-env
gh pr create --draft --base main --title "feat: Workerを一本化してPRプレビュー環境を追加" --body-file /tmp/score-splitter-pr-body.md
```

Expected: Draft PRとして作成され、CloudflareがPRコメントへブランチAlias Preview URLを投稿する。Preview URLでパスワードログイン、収入・支出・繰越CRUD、月コピー、月別集計、waitlistを確認し、D1 `score-splitter-db-dev` のみが更新される。パスキーは確認しない。

PR本文は `/tmp/score-splitter-pr-body.md` に日本語で作成し、概要、変更点、テスト結果、Preview URL確認項目、本番切替前バックアップゲート、ロールバック手順を記載する。さらに「Preview確認済み」「30分以内のPASS manifest」「manifestのGit HEAD SHAとPR HEAD一致」「ユーザーの本番切替承認」の必須チェック欄を設ける。

Draft維持はこのリポジトリ内のコードだけでは技術的に強制できず、GitHub側のRuleset設定もこの変更へ含めない。そのため、必須チェック欄がすべて完了し、ユーザーが明示承認するまでReady for reviewへ変更せず、マージもしない運用ゲートとする。

---

### Task 6: 本番切替直前のD1バックアップゲート

**Files:**
- Create: `scripts/backup-production-d1.mjs`
- Create: `tests/unit/scripts/backup-production-d1.test.ts`
- Modify: `package.json`
- Runtime output outside repository: `~/Documents/Backups/score-splitter/d1/<UTC日時>/score-splitter.sql`
- Runtime output outside repository: `~/Documents/Backups/score-splitter/d1/<UTC日時>/time-travel.json`
- Runtime output outside repository: `~/Documents/Backups/score-splitter/d1/<UTC日時>/manifest.json`

**Interfaces:**
- Consumes: CLI引数 `--confirm-production-d1 7f8d3531-a833-4474-84d5-cee3ac98ee96` または `--verify-release-manifest <絶対manifestパス>`、本番D1、Wrangler認証、ローカルSQLite
- Produces: worktree外の全量SQL、Time Travel復元地点、SHA-256・サイズ・本番/復元先の8テーブル件数を記録したPASS manifest、およびCloudflareへ接続しない切替直前の実体再検証結果

- [ ] **Step 1: バックアップ検証関数の失敗テストを書く**

`tests/unit/scripts/backup-production-d1.test.ts` に次を追加する。

```text
固定UUIDのCLI確認が無い、または異なるUUIDなら拒否する
d1 listから固定name+UUIDの一意entryを選び、version=productionでない場合を拒否する
Time Travel bookmarkが空なら拒否する
Time Travel bookmarkに英数字・underscore・hyphen以外が含まれたら拒否する
SQLが空、CREATE TABLEなし、INSERT INTOなしなら拒否する
SQLにSQLiteの行頭ドットコマンドが含まれたら拒否する
リポジトリ内Wranglerのversionが4.107.0以外なら拒否する
Git HEAD SHAが40文字の小文字hexでなければ拒否する
8テーブルの不足・不正件数を拒否する
本番件数とローカル復元件数の不一致をテーブル名付きで拒否する
開始/完了時刻、Git HEAD SHA、restore引数配列を持つ場合だけverification=PASSのmanifestを生成・検証する
manifest完了から30分超過、またはPR HEAD SHA不一致なら本番切替を拒否する
相対パス、固定保存root外、直下のバックアップdirより深いmanifestパスを拒否する
SQL実体の欠落・実サイズ・SHA-256不一致を拒否する
保存rootとバックアップdirが0700、SQL・Time Travel・manifestが0600でなければ拒否する
一時SQLite削除失敗時はmanifest.jsonを残さずcleanup-failed.partへ退避する
```

- [ ] **Step 2: REDを確認する**

Run:

```bash
npx vitest run tests/unit/scripts/backup-production-d1.test.ts
```

Expected: `scripts/backup-production-d1.mjs` が存在しないためFAILする。

- [ ] **Step 3: 安全側に失敗するバックアップスクリプトを実装する**

`scripts/backup-production-d1.mjs` はmainとして実行されたときだけ外部コマンドを起動し、純粋なnormalize/検証/manifest生成関数はexportする。次の順序を固定する。

```text
1. CLIで固定本番UUIDを明示確認する
2. `node_modules/.bin/wrangler --version` が厳密に4.107.0であることを確認する
3. Git HEAD SHAと開始UTC日時を取得する
4. wrangler d1 list --jsonから固定name+UUIDの一意entryを選び、version=productionを機械検証する
5. Time Travel info --jsonのbookmarkを文字種まで検証してtime-travel.json.partへ保存後renameする
6. export先をscore-splitter.sql.partにし、非空・CREATE TABLE・INSERT INTO・行頭ドットコマンド不在を検証後renameする
7. 本番8テーブルの件数をwrangler d1 execute --remote --jsonで取得する
8. `sqlite3 -safe -bail` で一時SQLiteへSQLを復元し、integrity_check=okと8テーブル件数一致を検証する
9. Node cryptoでSHA-256を計算する
10. Git HEAD SHA、開始/完了UTC日時、restore実行ファイルと引数配列を含むmanifest.json.partを再parse・検証する
11. manifest.jsonへrenameした後だけ一時SQLiteを削除する。cleanup失敗時はmanifest.cleanup-failed.partへ戻して非0終了する
```

固定値はDB名 `score-splitter`、UUID `7f8d3531-a833-4474-84d5-cee3ac98ee96`、Wrangler version `4.107.0`、設定 `cloudflare/worker/wrangler.jsonc`、保存root `homedir()/Documents/Backups/score-splitter/d1` とする。`npx` は使わずリポジトリ内の固定Wranglerを直接実行する。D1一覧で照合した後のTime Travel、export、件数取得とmanifestに記録する手動restoreコマンドは、DB名ではなく固定UUIDを引数に使い、名前の付け替えによる対象ずれを防ぐ。ディレクトリは700、SQL・Time Travel・manifest・cleanup失敗情報は600にする。すべての子プロセスは引数配列と `shell: false` で起動する。Time Travel restoreコマンドは文字列に加えて実行ファイルと引数配列をmanifestへ記録するだけで、絶対に実行しない。

`runProductionBackup` の統合テストではコマンド実行器と保存rootだけを差し替え、偽Wrangler/SQLiteで `list → bookmark → export → remote count → SQLite復元・検証` の順序、Time Travel restore非実行、途中失敗時にPASS manifestが存在しないことを確認する。実際のCloudflareコマンドはテストから起動しない。

`package.json` のWrangler指定は `^4.107.0` のため、将来のinstallで別versionになった場合はスクリプトが安全側に拒否する。更新時は新versionのD1 JSON契約を検証し、依存versionとスクリプト内の期待versionを同じPRで更新する。

失敗時は `manifest.json` を確定しない。一時SQLiteを調査用に残してパスを報告し、本番デプロイを解放しない。

`package.json` へ次を追加する。

```json
"backup:d1:production": "node scripts/backup-production-d1.mjs",
"verify:d1:production-backup": "node scripts/backup-production-d1.mjs --verify-release-manifest"
```

- [ ] **Step 4: GREEN、型、静的安全性を確認する**

Run:

```bash
npx vitest run tests/unit/scripts/backup-production-d1.test.ts
npm run typecheck
rg -n "time-travel.*restore" scripts/backup-production-d1.mjs
```

Expected: テストと型チェックがPASSする。restore文字列・引数配列はmanifest生成箇所だけに存在し、子プロセス実行には渡されない。スクリプト内に `npx` がなく、SQLite復元引数に `-safe` がある。

- [ ] **Step 5: バックアップ実装をコミットしてDraft PRへpushする**

```bash
git add scripts/backup-production-d1.mjs tests/unit/scripts/backup-production-d1.test.ts package.json docs/superpowers/plans/2026-09-02-unified-worker-dev-previews.md docs/superpowers/specs/2026-09-02-unified-worker-dev-previews-design.md
git commit -m "feat: 本番D1バックアップゲートを追加"
git push
```

Expected: バックアップゲート実装がDraft PRに含まれる。push後も `manifest.json` がPASSになるまではDraftを解除しない。

- [ ] **Step 6: PRプレビュー確認後、低利用時間帯にバックアップを実行する**

SQL exportは本番D1アクセスを一時的にブロックし得るうえ、export後の本番件数と復元件数を比較するには書込み停止が必要である。開始前にユーザーへ通知し、アプリ利用者が書込みを止めた明示的なmaintenance windowへ入る。maintenance windowはPASS manifest確定まで継続する。本番コマンドをユニットテストや実装確認中に試し打ちしない。

Run:

```bash
npm run backup:d1:production -- --confirm-production-d1 7f8d3531-a833-4474-84d5-cee3ac98ee96
```

Expected: exit 0で `本番D1バックアップ検証 PASS` と永続ディレクトリが表示される。そこに完成ファイル `score-splitter.sql`、`time-travel.json`、`manifest.json` があり、`.part` は無い。cleanupを含む失敗時は成功表示も `manifest.json` もなく、本番Workerを変更しない。

- [ ] **Step 7: manifestで本番切替ゲートを再確認する**

スクリプトが表示した絶対パスの `manifest.json` を使い、Cloudflareへ接続しない再検証CLIを実行する。相対パスや固定保存root外のパスは使用しない。

```bash
npm run verify:d1:production-backup -- ~/Documents/Backups/score-splitter/d1/<UTC日時>/manifest.json
```

CLIが次をすべて確認してPASSすることを確認する。

```text
verification = PASS
startedAt / completedAt = 正規化済みUTC日時
completedAt = 本番切替確認時刻から30分以内
gitHeadSha = 現在のPR HEAD SHA
wranglerVersion = 4.107.0
database.name = score-splitter
database.uuid = 7f8d3531-a833-4474-84d5-cee3ac98ee96
database.version = production
sqliteIntegrityCheck = ok
counts.remote と counts.restored の8テーブルが一致
timeTravel.restoreCommandArgs = 検証済みbookmarkを含む固定引数配列
SQLの実ファイルSHA-256とmanifest.sql.sha256が一致
ディレクトリ700、3ファイル600
```

`counts.remote` はexport完了後に取得するため、`counts.restored` との一致はmaintenance window中の補助検証である。D1 export時点と件数照会時点が同一スナップショットであること自体を保証するものではない。書込みが発生した、30分を超過した、またはPR HEADが変わった場合はバックアップを再取得する。

- [ ] **Step 8: Draft解除を解放する**

PR本文の必須チェックをすべて満たし、完了後30分以内かつPR HEAD SHA一致の `manifest.json` があり、ユーザーが本番切替を明示承認した場合だけPRをReady for reviewへ変更できる。どれか1つでも満たさない場合はDraftのままにし、マージと本番デプロイを禁止する。これは運用ゲートでありGitHub設定による技術的強制ではない。PRのマージ自体はこのタスクでは行わない。

---

## 本番切替後の別タスク

初回PRのマージと本番安定確認後、次を別PRで行う。今回の実装タスクへ含めない。

- root `wrangler.jsonc` から `global_fetch_strictly_public` と `CLOUDFLARE_WORKER_API_URL` を削除
- 本番 `CLOUDFLARE_WORKER_API_TOKEN` とAPI Workerの `WORKER_API_TOKEN` を削除
- `score-splitter-api`、`api.yamawake.app`、API用Workers Buildsを停止
- `cloudflare/worker/src` のD1操作を `src/lib/server/db` へ移動
- `src/lib/api` の命名とテスト専用MSW経路を整理
- `cloudflare/worker/wrangler.jsonc` と `deploy:worker` を削除
