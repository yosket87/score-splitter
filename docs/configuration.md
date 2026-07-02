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
    command: 'npm run dev',
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
| webServer.command | npm run dev | テスト前に起動するサーバー |
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

const nextConfig: NextConfig = {
  /* config options here */
}

export default nextConfig
```

## 環境変数

`.env.local` ファイルで設定（gitignore対象）：

```
CLOUDFLARE_WORKER_API_URL=your_worker_api_url
CLOUDFLARE_WORKER_API_TOKEN=your_worker_api_token
APP_PASSWORD_HASH_BASE64=your_password_hash_base64
```

| 変数 | 説明 |
|-----|------|
| CLOUDFLARE_WORKER_API_URL | Cloudflare Worker APIのURL |
| CLOUDFLARE_WORKER_API_TOKEN | Worker API共有シークレット（サーバー専用） |
| APP_PASSWORD_HASH_BASE64 | アプリパスワードのbcryptハッシュ（Base64エンコード） |
