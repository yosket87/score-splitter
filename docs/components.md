# コンポーネント構造

## コンポーネント分類

### UIコンポーネント (`src/components/ui/`)

shadcn/uiベースの再利用可能なUIコンポーネント群。

| コンポーネント | ファイル | 説明 |
|--------------|---------|------|
| Button | `button.tsx` | ボタン |
| Card | `card.tsx` | カードコンテナ |
| Dialog | `dialog.tsx` | モーダルダイアログ |
| Form | `form.tsx` | フォームコンテキスト（RHF連携） |
| Input | `input.tsx` | テキスト入力 |
| Label | `label.tsx` | フォームラベル |
| Select | `select.tsx` | セレクトボックス |
| Table | `table.tsx` | テーブル |
| Collapsible | `collapsible.tsx` | 折りたたみ可能コンテナ |
| PersonBadge | `person-badge.tsx` | 担当者バッジ（夫/妻表示） |
| Sonner | `sonner.tsx` | トースト通知 |

### レイアウトコンポーネント (`src/components/layout/`)

| コンポーネント | ファイル | 説明 |
|--------------|---------|------|
| Header | `header.tsx` | ページヘッダー（ロゴ、ログアウトボタン） |
| MonthSelector | `month-selector.tsx` | 月選択ナビゲーション |

### 共有コンポーネント (`src/components/`)

| コンポーネント | ファイル | 説明 |
|--------------|---------|------|
| SectionShell | `entry-section.tsx` | 収入/支出/繰越セクションの共通シェル |
| EntryRow | `entry-section.tsx` | 収入/支出/繰越の行表示 |
| EntryFields | `entry-fields.tsx` | 収入/支出/繰越フォームの共通入力フィールド |

### 機能コンポーネント (`src/features/`)

| コンポーネント | ファイル | 説明 |
|--------------|---------|------|
| IncomeSection | `income/index.tsx` | 収入管理セクション |
| ExpenseSection | `expense/index.tsx` | 支出管理セクション |
| CarryoverSection | `carryover/index.tsx` | 繰越管理セクション |
| CopyMonthDialog | `copy-month/index.tsx` | 月データコピー機能ダイアログ |

## コンポーネント階層

```
app/layout.tsx
└── app/page.tsx
    ├── Header
    │   └── ログアウトボタン
    ├── MonthSelector
    │   ├── 前月ボタン
    │   ├── 月表示
    │   ├── 次月ボタン
    │   └── CopyMonthDialog
    ├── IncomeSection
    │   ├── SectionShell
    │   └── EntryRow
    ├── ExpenseSection
    │   ├── SectionShell
    │   └── EntryRow
    ├── CarryoverSection
    │   ├── SectionShell
    │   └── EntryRow
    └── AddEntryModal / EditModal
        └── EntryFields
```

## Server Actions (`src/app/actions/`)

コンポーネントから呼び出されるサーバーサイド関数。

| ファイル | 関数 | 説明 |
|---------|-----|------|
| `auth.ts` | `login()` | ログイン処理 |
| | `logout()` | ログアウト処理 |
| | `checkAuth()` | 認証状態確認 |
| `income.ts` | `getIncomes()` | 収入一覧取得 |
| | `createIncome()` | 収入追加 |
| | `updateIncome()` | 収入更新 |
| | `deleteIncome()` | 収入削除 |
| `expense.ts` | `getExpenses()` | 支出一覧取得 |
| | `createExpense()` | 支出追加 |
| | `updateExpense()` | 支出更新 |
| | `deleteExpense()` | 支出削除 |
| `carryover.ts` | `getCarryovers()` | 繰越一覧取得 |
| | `createCarryover()` | 繰越追加 |
| | `updateCarryover()` | 繰越更新 |
| | `deleteCarryover()` | 繰越削除 |
| `copy-month.ts` | `copyMonthData()` | 月データコピー |
