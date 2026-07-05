# Recursive Features Directory Structure

ドメイン機能は `src/features/<feature-name>/` 配下に配置する。
参考: https://zenn.dev/pksha/articles/recursive-features-directory-structure

## feature ディレクトリの構成

```
src/features/<feature-name>/
├── index.tsx          # エントリポイント（外部公開コンポーネント）
├── components/        # この feature に閉じた子コンポーネント（任意）
│   └── *.tsx
├── features/          # サブ feature（再帰的にネスト可能、任意）
│   └── <sub>/
│       ├── index.tsx
│       └── components/
├── types.ts           # feature ローカルの型定義（任意）
└── utils.ts           # feature ローカルのユーティリティ（任意）
```

## 厳守ルール

1. **index.tsx のみ外部公開** — 異なる feature からの import は必ず `index.tsx` 経由。同一 feature 内部は `./components/xxx` 等の直接参照を許容
2. **page.tsx は薄いラッパー** — データフェッチ（Server Actions 呼び出し）+ feature の合成のみ。ビジネスロジックを含めない
3. **Server Actions は `app/actions/` に据え置き** — feature 内から `@/app/actions/xxx` を直接 import して使用。feature 内に Server Actions を置かない
4. **components/ = 原則 props のみ** — feature 内の `components/` は props で動く純粋描画コンポーネント。ただしフォーム送信で Server Actions を呼ぶケースは許容
5. **再帰ネスト** — `features/xxx/features/yyy/` のようにサブ feature を持てる。子コンポーネントが 5 個を超えた場合や独立テスト可能な単位が見えた場合にネストを検討
6. **スコープ管理** — 特定 feature 専用のコンポーネントはその feature の `components/` に配置

## page.tsx のパターン

```tsx
// src/app/[year]/[month]/page.tsx
import { IncomeSection } from '@/features/income'
import { ExpenseSection } from '@/features/expense'
import { getIncomesByMonth } from '@/app/actions/income'

export default async function MonthPage({ params }) {
  const { year, month } = await params
  const [incomesResult, expensesResult] = await Promise.all([
    getIncomesByMonth(month),
    getExpensesByMonth(month),
  ])

  return (
    <>
      <IncomeSection incomes={incomesResult.data ?? []} month={month} />
      <ExpenseSection expenses={expensesResult.data ?? []} month={month} />
    </>
  )
}
```

## feature の index.tsx パターン

```tsx
// src/features/income/index.tsx
'use client'

import { updateIncome, deleteIncome } from '@/app/actions/income'
import { IncomeRow } from './components/income-row'
import type { Income } from '@/types'

interface IncomeSectionProps {
  incomes: Income[]
  month: string
}

export function IncomeSection({ incomes, month }: IncomeSectionProps) {
  return (
    <section>
      {incomes.map((income) => (
        <IncomeRow key={income.id} income={income} />
      ))}
    </section>
  )
}
```

## feature 外に残すもの

| パス | 役割 |
|------|------|
| `src/components/ui/` | shadcn/ui 基盤コンポーネント |
| `src/components/animations/` | 共有アニメーショントークン・コンポーネント |
| `src/components/layout/` | アプリ全体レイアウト（Header 等） |
| `src/components/providers/` | グローバルプロバイダー |
| `src/app/actions/` | Server Actions（API層） |
| `src/lib/` | 共有ユーティリティ、Supabase設定、バリデーション |
| `src/hooks/` | 横断フック（useIsMobile 等） |
| `src/types/` | 共有型定義 |

## コンポーネントの配置判断

- 1 つの feature でしか使わない → その feature の `components/` に配置
- 複数 feature で使う UI パーツ → `src/components/ui/` に配置
- アプリ全体のレイアウト → `src/components/layout/` に配置
- ドメインを跨いで使う → `src/components/` 直下に配置

## 新しいページ・機能を追加するとき

1. `src/features/<name>/index.tsx` を作成（named export）
2. feature 固有の子コンポーネントは `src/features/<name>/components/` に配置
3. `src/app/.../page.tsx` から feature をインポートして合成
4. Server Actions が必要なら `src/app/actions/` に追加

## プロジェクト固有ルール

- **named export のみ**: default export は `page.tsx` / `layout.tsx` 以外で使わない
- **横断フック**: `src/hooks/` には useIsMobile 等の横断ユーティリティのみ配置
- **バリデーション**: Zod スキーマは `src/lib/validations/` に集約（feature 内に置かない）

## 移行方針

- **新規機能**: 必ず `src/features/` に作成
- **既存コード**: ドメイン機能は `src/features/` へ移行済み
- **共有コンポーネント**: 複数 feature で使うドメイン横断コンポーネントは `src/components/` 直下に配置
- 旧ディレクトリ（`src/components/sections/`, `src/components/forms/`）は削除済み
