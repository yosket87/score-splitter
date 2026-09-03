# 設定ファイル

## TypeScript設定 (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 主要設定

| 設定 | 値 | 説明 |
|-----|---|------|
| target | ES2017 | 出力JSバージョン |
| strict | true | 厳密な型チェック |
| moduleResolution | bundler | Next.js用モジュール解決 |
| paths | @/* → ./src/* | パスエイリアス |

## Vitest設定 (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/components/ui/**']
    }
  }
})
```

### 主要設定

| 設定 | 値 | 説明 |
|-----|---|------|
| environment | jsdom | DOM環境シミュレーション |
| globals | true | describe, it等をグローバルに |
| setupFiles | tests/setup.ts | セットアップファイル |
| coverage.exclude | src/components/ui/** | UIコンポーネントを除外 |

## Playwright設定 (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev:mock',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ]
})
```

### 主要設定

| 設定 | 値 | 説明 |
|-----|---|------|
| testDir | ./tests/e2e | E2Eテストディレクトリ |
| baseURL | http://localhost:3000 | テスト対象URL |
| webServer.command | npm run dev:mock | MSWモック付きサーバーをテスト前に起動 |
| projects | chromium | テスト対象ブラウザ |

## ESLint設定 (`eslint.config.mjs`)

Next.js推奨のESLint設定を使用。

```javascript
import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
]

export default eslintConfig
```

## PostCSS設定 (`postcss.config.mjs`)

Tailwind CSS v4用の設定。

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
```

## shadcn/ui設定 (`components.json`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### 主要設定

| 設定 | 値 | 説明 |
|-----|---|------|
| style | new-york | UIスタイルテーマ |
| rsc | true | React Server Components対応 |
| baseColor | neutral | ベースカラー |
| cssVariables | true | CSS変数使用 |
| iconLibrary | lucide | アイコンライブラリ |

## Next.js設定 (`next.config.ts`)

```typescript
import type { NextConfig } from "next"
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

const nextConfig: NextConfig = {
  /* config options here */
}

export default nextConfig

// next dev 時にCloudflareバインディングのローカルプロキシを有効化（本番ビルドには影響しない）
initOpenNextCloudflareForDev()
```

## Cloudflare設定

通常運用はrootのNext.js/OpenNext Worker 1つで、D1 bindingを直接利用する。`cloudflare/worker/src/` のD1ドメイン関数は共有し、HTTP入口の `index.ts` と旧API Worker設定は切り戻し用に残している。

| ファイル | Worker名 | 役割 |
|---------|---------|------|
| `wrangler.jsonc`（root） | `score-splitter` | 本番のNext.js/OpenNext Worker + 本番D1 binding `DB` |
| `wrangler.jsonc`（`env.dev`） | `score-splitter-dev` | 開発・PR PreviewのNext.js/OpenNext Worker + 開発D1 binding `DB` |
| `cloudflare/worker/wrangler.jsonc` | `score-splitter-api` | `src/index.ts` の旧HTTP入口用設定。D1ドメイン関数はroot Workerと共有し、HTTP入口は切り戻し用 |

### root `wrangler.jsonc`（本番Worker）の要点

- `main: .open-next/worker.js` — `opennextjs-cloudflare build` の生成物
- `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]` — Node.js API互換。旧APIを切り戻す場合を除き、公開HTTP APIへのfetchは行わない
- `keep_names: false` — next-themes等がスクリプトを文字列化する際にesbuildの `__name` ヘルパーが混入する既知問題への対処
- `vars` には非シークレットのみ記載。**シークレットを `vars` に書くとdeployのたびにダッシュボード設定を上書きするため厳禁**
- `d1_databases` は本番 `score-splitter` と `env.dev` の `score-splitter-db-dev` を明示的に分離する。named environmentではbindingを継承しないため、両方に `DB` を定義する
- 固定の開発Custom Domainは作成せず、Workers BuildsのブランチPreview URLを使用する

### 旧API Workerの切り戻し資産

`cloudflare/worker/src/index.ts` は旧HTTP APIの入口で、`cloudflare/worker/src/` 内のD1ドメイン関数とは役割が異なる。通常のroot WorkerからのリクエストはこのHTTP入口を経由しない。

### open-next.config.ts

`defineCloudflareConfig()` を素のまま使用。ISR/SSG不使用（全ページ動的レンダリング）のためincremental cacheは未設定。将来ISRを導入する場合はR2 incremental cacheを追加する。

### cloudflare-env.d.ts

`npm run cf-typegen` で生成（コミット対象）。`wrangler.jsonc` の `vars` 変更後は再生成する。ランタイム型は `--include-runtime=false` で除外している（Workersの `Request` 型がDOMの `Request` 型と衝突しMSWの型チェックが壊れるため）。

## 環境変数

### 実行時の読み出しに関する制約

OpenNextはリクエスト処理開始時にWorkerの `env` を `process.env` へコピーする。そのため **`process.env.X` はリクエストコンテキスト内（Server Actions・RSCの関数内）でのみ読み出すこと**。モジュールトップレベルで読むと `undefined` になる。

### 本番（Cloudflare）での設定先

| 変数 | 設定先 | 説明 |
|-----|-------|------|
| WEBAUTHN_RP_ID / WEBAUTHN_RP_ORIGIN / WEBAUTHN_RP_NAME | `wrangler.jsonc` の `vars` | WebAuthn（パスキー）のRP設定 |
| APP_PASSWORD_HASH_BASE64 | `wrangler secret put` | アプリパスワードのbcryptハッシュ（Base64エンコード） |
| AI_PROVIDER | `wrangler.jsonc` の `vars` | 本番は `openai` |
| OPENAI_CLASSIFICATION_MODEL | `wrangler.jsonc` の `vars` | 支出分類モデル（既定 `gpt-5-mini`） |
| OPENAI_DIAGNOSIS_MODEL | `wrangler.jsonc` の `vars` | 診断文モデル（既定 `gpt-5-mini`） |
| OPENAI_API_KEY | `wrangler secret put OPENAI_API_KEY` | OpenAI APIキー（サーバー専用） |

### 旧API切り戻し用の変数

以下は移行期間中のrollback-only設定であり、通常のD1直接アクセスでは読み出さない。

| 変数 | 設定先 | 用途 |
|-----|-------|------|
| CLOUDFLARE_WORKER_API_URL | root `wrangler.jsonc` の `vars` | 旧HTTP API `api.yamawake.app` の接続先 |
| CLOUDFLARE_WORKER_API_TOKEN | `score-splitter` のsecret | root Workerから旧HTTP APIへ切り戻す場合のBearerトークン |
| WORKER_API_TOKEN | `score-splitter-api` のsecret | 旧HTTP APIのBearer検証 |

開発WorkerのパスワードシークレットはGitに保存せず、次で設定する。

```bash
npx wrangler secret put APP_PASSWORD_HASH_BASE64 --env dev
```

本番切替前は、別途 `npm run backup:d1:production -- --confirm-production-d1 <本番D1 UUID>` がPASSになることを確認する。

### ローカル開発

- `next dev` / `next build`: `.env.local`（gitignore対象）
- `opennextjs-cloudflare preview`（workerd実行）: `.dev.vars`（gitignore対象、`.dev.vars.example` をコピーして作成）

```
NEXTJS_ENV=development
APP_PASSWORD_HASH_BASE64=your_password_hash_base64
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_ORIGIN=http://localhost:8787
WEBAUTHN_RP_NAME=ヤマワケ
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_CLASSIFICATION_MODEL=gpt-5-mini
OPENAI_DIAGNOSIS_MODEL=gpt-5-mini
```

`CLOUDFLARE_WORKER_API_URL` / `CLOUDFLARE_WORKER_API_TOKEN` は `USE_MOCKS=true` の旧HTTP/MSWテスト時だけ必要です。

### AI家計診断

- ローカルの実API確認はgitignore対象の `.env.local` に上記AI変数を設定する。APIキーを `.env.mock`、`wrangler.jsonc`、`NEXT_PUBLIC_*` へ置かない。
- `npm run dev:mock` は `.env.mock` の `AI_PROVIDER=mock` を使う。分類・診断は決定的なローカル実装だけで完結し、OpenAIへの通信は0件。
- OpenAIの応答待ちは支出分類・診断文ともに30秒。SDKの自動再試行は無効で、構造化出力の不備だけ各処理で一度再試行する。API待ち時間は最大120秒とし、3分の実行リース内にDB処理の余裕を残す。タイムアウト時は処理を終了してロックを解除する。
- 診断文は数字・金額・割合・個人評価を追加せず、数値を含む支出ラベルも分類名で説明するよう指示する。検証では「円滑・円満・工夫・大丈夫」を一般語として区別するが、同じ文章内の禁止表現は拒否する。数値関連の失敗は固定理由 `narrative_number`（数字）、`narrative_currency`（通貨）、`narrative_percentage`（割合記号）で区別し、本文は記録しない。診断文の再試行には固定の修正指示だけを追加し、失敗した返答やエラー本文は再送しない。
- 本番のAPIキーは `npx wrangler secret put OPENAI_API_KEY` で登録する。漏えい・担当者変更・定期運用の基準に従いキーをローテーションし、旧キーを失効させる。
- 開発用のキーは `score-splitter-dev` の実行時Secret `OPENAI_API_KEY` に設定する。`env.dev.vars` にAIプロバイダーとモデルを明示し、devのD1だけを利用する。設定反映はdevのPRビルドで行い、本番へ公開しない。
- `gpt-5-mini` は現行エイリアスを使用する。応答差分を固定したい場合は、利用可能な現行snapshotを環境変数で指定する。deprecatedな `gpt-5-mini-2025-08-07` は使用しない。
- **学習利用**: OpenAI APIに送ったデータは、明示的にopt-inしない限りモデルの学習・改善に使用されないというOpenAIの既定に従う。これは当組織がopt-inしていないことの断定ではないため、API管理者は対象組織・projectの共有設定を確認する。
- **Application state**: 本アプリのResponses API呼び出しは常に `store: false`とし、通常の同期応答を後続API操作用に保持しない。この制御は次のabuse monitoring logsとは別物で、`store: false` だけでそれらを無効化できない。利用機能ごとの例外は公式表を確認する。
- **Abuse monitoring logs**: 既定でprompt・response等の顧客コンテンツを含む場合があり、原則最大30日保持され得る。法令上またはサービス・第三者を危害から保護するためにより長くなる例外もある。
- **Zero Data Retention / Modified Abuse Monitoring**: 適格顧客向けであり、OpenAIの事前承認と追加要件の受諾が必要。承認後はOpenAI Platformの `Settings → Organization → Data controls`で組織単位とproject単位の設定を確認する。projectが組織設定を継承するか、ZDR/MAM/無効のどれかを実運用のAPI keyで確認し、未確認の状態をZDR/MAM有効と断定しない。
- 保持の既定、対象endpoint、承認条件、設定画面の最新情報は [OpenAI公式 Data Controls](https://developers.openai.com/api/docs/guides/your-data) を参照する。
- 障害時は既存の家計データを変更せず、保存済み診断があれば表示を維持する。新規実行・再診断だけを安全な固定メッセージで失敗させる。
- モデル設定は非秘密だが、APIキー、認証Cookie、Worker共有トークン、担当者、収入ラベル、レコードIDをプロバイダーpayloadやログへ含めない。
