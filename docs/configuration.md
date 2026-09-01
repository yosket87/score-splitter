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

フロントエンド・APIともCloudflare Workersにホストしており、wrangler設定は2ファイル構成。

| ファイル | Worker名 | 役割 |
|---------|---------|------|
| `wrangler.jsonc`（root） | `score-splitter-web` | フロントエンド（Next.js on Workers / OpenNext） |
| `cloudflare/worker/wrangler.jsonc` | `score-splitter-api` | Worker API（D1バインディング `DB`） |

### root `wrangler.jsonc`（フロントエンド）の要点

- `main: .open-next/worker.js` — `opennextjs-cloudflare build` の生成物
- `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]` — Node.js API互換と、同一アカウントのWorker APIへのHTTP fetchを公開URL経由で通すために必要
- `keep_names: false` — next-themes等がスクリプトを文字列化する際にesbuildの `__name` ヘルパーが混入する既知問題への対処
- `vars` には非シークレットのみ記載。**シークレットを `vars` に書くとdeployのたびにダッシュボード設定を上書きするため厳禁**

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
| CLOUDFLARE_WORKER_API_URL | `wrangler.jsonc` の `vars` | Worker APIのURL |
| WEBAUTHN_RP_ID / WEBAUTHN_RP_ORIGIN / WEBAUTHN_RP_NAME | `wrangler.jsonc` の `vars` | WebAuthn（パスキー）のRP設定 |
| CLOUDFLARE_WORKER_API_TOKEN | `wrangler secret put` | Worker API共有シークレット（サーバー専用） |
| APP_PASSWORD_HASH_BASE64 | `wrangler secret put` | アプリパスワードのbcryptハッシュ（Base64エンコード） |
| AI_PROVIDER | `wrangler.jsonc` の `vars` | 本番は `openai` |
| OPENAI_CLASSIFICATION_MODEL | `wrangler.jsonc` の `vars` | 支出分類モデル（既定 `gpt-5-mini`） |
| OPENAI_DIAGNOSIS_MODEL | `wrangler.jsonc` の `vars` | 診断文モデル（既定 `gpt-5-mini`） |
| OPENAI_API_KEY | `wrangler secret put OPENAI_API_KEY` | OpenAI APIキー（サーバー専用） |

### ローカル開発

- `next dev` / `next build`: `.env.local`（gitignore対象）
- `opennextjs-cloudflare preview`（workerd実行）: `.dev.vars`（gitignore対象、`.dev.vars.example` をコピーして作成）

```
CLOUDFLARE_WORKER_API_URL=your_worker_api_url
CLOUDFLARE_WORKER_API_TOKEN=your_worker_api_token
APP_PASSWORD_HASH_BASE64=your_password_hash_base64
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_CLASSIFICATION_MODEL=gpt-5-mini
OPENAI_DIAGNOSIS_MODEL=gpt-5-mini
```

### AI家計診断

- ローカルの実API確認はgitignore対象の `.env.local` に上記AI変数を設定する。APIキーを `.env.mock`、`wrangler.jsonc`、`NEXT_PUBLIC_*` へ置かない。
- `npm run dev:mock` は `.env.mock` の `AI_PROVIDER=mock` を使う。分類・診断は決定的なローカル実装だけで完結し、OpenAIへの通信は0件。
- 本番のAPIキーは `npx wrangler secret put OPENAI_API_KEY` で登録する。漏えい・担当者変更・定期運用の基準に従いキーをローテーションし、旧キーを失効させる。
- `gpt-5-mini` は現行エイリアスを使用する。応答差分を固定したい場合は、利用可能な現行snapshotを環境変数で指定する。deprecatedな `gpt-5-mini-2025-08-07` は使用しない。
- Responses API呼び出しは常に `store: false`。加えてOpenAI組織側のData Controlsと保持期間を管理者が確認し、必要最小限の保持設定にする。
- 障害時は既存の家計データを変更せず、保存済み診断があれば表示を維持する。新規実行・再診断だけを安全な固定メッセージで失敗させる。
- モデル設定は非秘密だが、APIキー、認証Cookie、Worker共有トークン、担当者、収入ラベル、レコードIDをプロバイダーpayloadやログへ含めない。
