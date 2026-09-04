# Plan 001: 現行の月次画面に精算の内訳を追加する

> この計画を上から実行し、検証結果を記録する。実装担当は別ブランチで作業する。
> 最初に `git diff --stat 03ef7db..HEAD -- src/features/monthly-overview src/lib/utils/calculation.ts src/lib/utils/format.ts src/components/ui/collapsible.tsx tests/components/features/monthly-overview.test.tsx tests/unit/calculation.test.ts` を実行し、以下の抜粋と現コードを照合する。未コミット差分も `git status --short` と `git diff` で確認し、既存の変更を上書きしない。

## Status

- Priority: P1
- Effort: M（半日〜1日程度、境界値とブラウザ検証込み）
- Risk: LOW（表示のみ。計算・保存仕様は変更しない）
- Depends on: なし
- Category: direction
- Planned at: `03ef7db`, 2026-09-04
- Status: DONE

## 目的と採用済みの条件

ヤマワケは、夫婦の収入から精算対象支出を引き、残額を均等に分けるアプリ。利用者は「③精算の内訳表示」と「①精算完了・月締め」を採用した。「②未入力管理」は項目名だけ登録する運用がほぼないため不採用。下書き、未入力チェック、テンプレート、金額未入力を理由にした確定制限を追加しない。

この計画は内訳表示のみを扱う。現在の月次要約で精算額を見た利用者が、画面内でその根拠を確認できるようにする。別の月締め機能が完成していなくても単独で利用できる。

## 現状と実装例

- `src/features/monthly-overview/index.tsx:74` は既に計算済みデータを持つ。

```tsx
const result = calculateSettlement(incomes, expenses, carryovers)
const { expenseTotal, balance } = calculateMonthBalance(incomes, expenses)
const settlementDirection = getSettlementDirectionLabel(result.settlement)
```

- 同ファイルの精算額ブロック直後に、月収支・お小遣いカードが並び、その下に `TrendCard` がある。
- `src/lib/utils/calculation.ts:20` は通常支出と清算対象繰越を精算対象にする。

```ts
const actualExpenses = filterActualExpenses(expenses)
const clearedCarryovers = filterClearedCarryovers(carryovers)
```

- 同ファイルの計算は次の通り。`husbandExpense` と `wifeExpense` は清算対象繰越を含む負の値。

```ts
const husbandTotal = husbandIncome + husbandExpense
const wifeTotal = wifeIncome + wifeExpense
const allowance = (totalIncome + totalExpense) / 2
const settlement = husbandTotal - allowance
```

- `src/lib/utils/format.ts:15` は表示時に `Math.floor(Math.abs(value))` を使う。計算には0.5円が残る可能性があり、表示値だけを引き算すると1円ずれるケースがある。
- `src/components/ui/collapsible.tsx` が Radix の `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` を公開している。既存部品を利用する。
- テストは `tests/components/features/monthly-overview.test.tsx` の `render` / `screen` / `within` パターンと、`tests/unit/calculation.test.ts` の繰越ケースを踏襲する。

## 画面仕様

1. 精算額・方向の直下、月収支の手前に「精算の内訳」の折りたたみを追加する。初期状態は閉じる。新規ページ・新規ナビゲーションは作らない。
2. 開いた内容に、夫・妻それぞれの「収入」「精算対象の支出」「差引」と、「1人あたりのお小遣い」「精算額・方向」を表示する。値は親から渡した `CalculationResult` を利用し、独立した精算計算を作らない。
3. 清算対象繰越がある場合は「精算対象の支出には、今月清算する繰越を含みます」と明示する。未清算繰越と繰越扱い支出は含めない。月収支と精算対象の支出が一致するとは限らない。
4. 精算額0は「精算不要」と表示し、送金方向を付けない。赤字月に「ふたりにお金が残る」と断定する説明を付けない。
5. 通常は既存 `formatCurrency` を利用する。小数があるケースは内訳に限り計算上の0.5円を表示し、「計算上の金額です。上部の表示は1円未満を切り捨てています」と説明する。既存のヒーロー・CSV・計算関数の丸めは変更しない。実際に記録する支払額の端数方針は月締めの設計で決める。
6. 現行のヘッダー、青・ローズの担当者色、黒い金額、薄いガラス背景、明細行、月コピー、CSV、推移グラフは維持する。モバイルは1カラム、1024px以上は左要約・右明細。画像案に見えない推移グラフも削除しない。
7. トリガーは44px以上、キーボード操作可能、開閉状態を支援技術に通知する。独自の大きなアニメーションは追加しない。

## Scope

変更可能:
- `src/features/monthly-overview/index.tsx`
- `src/features/monthly-overview/components/settlement-breakdown.tsx`（新規）
- `tests/components/features/monthly-overview.test.tsx`
- `tests/components/features/settlement-breakdown.test.tsx`（新規）
- `tests/e2e/settlement-breakdown.spec.ts`（新規）
- `plans/README.md` の進捗と本計画の検証記録

参照のみ: `src/lib/utils/calculation.ts`, `src/lib/utils/format.ts`, `src/types/index.ts`, `src/components/ui/collapsible.tsx`, `src/app/[year]/[month]/page.tsx`, `src/mocks/`, `tests/e2e/helpers.ts`。

対象外: DB・API・認証・LP・グローバルCSS・精算完了状態・入力項目やバリデーションの変更・元のCSV形式変更。

## Commands

依存導入済みを前提とする。コマンドはリポジトリの設定から確認済みだが、この計画作成時には実行していない。

| 目的 | コマンド | 期待結果 |
|---|---|---|
| 関連テスト | `npm run test:run -- tests/components/features/monthly-overview.test.tsx tests/unit/calculation.test.ts` | 全件成功 |
| 新規コンポーネント | `npm run test:run -- tests/components/features/settlement-breakdown.test.tsx` | RED時は未実装により失敗、実装後は全件成功 |
| 型検証 | `npx tsc --noEmit --incremental false` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| 全体テスト | `npm run test:coverage` | 全件成功、既存の80%以上基準を維持 |
| ビルド | `npm run build` | exit 0 |
| E2E | `npm run test:e2e -- tests/e2e/settlement-breakdown.spec.ts` | Chromium成功 |
| モック表示 | `npm run dev:mock` | localhost:3000で起動 |

## 手順

### 1. ベースラインを確認する
作業ブランチ `feat/settlement-breakdown` を作り、関連テストを実行する。既存失敗は新規実装と切り分けて記録する。

検証: 上表の「関連テスト」→ 全件成功。

### 2. 内訳の振る舞いをテストで固定する
新規コンポーネントテストに、閉じた初期状態・クリックとキーボードによる開閉・夫→妻・妻→夫・0円・赤字・空配列・清算対象繰越・未清算繰越の除外・0.5円のケースを作る。期待値は既存計算関数を呼んで生成せず、手計算した固定値を使う。

具体例: 夫収入400,000円、妻収入280,000円、夫通常支出147,000円、妻通常支出58,000円なら、お小遣い237,500円、夫→妻15,500円。夫収入101円・妻収入0円・支出0円なら計算上のお小遣いと精算額は50.5円。表示上の50円と混同させない。

検証: 新規コンポーネントテスト→ 機能未実装のため意図した失敗。既存テストは成功。

### 3. 表示部品と要約への組み込み
新規部品の入力は `result: CalculationResult` と繰越説明の要否。親の既存計算結果を渡す。日本語ラベルとセマンティックな説明リストを利用する。必要な局所的表示ヘルパーは同部品内に閉じる。

検証: 新規・既存のコンポーネントテスト、型検証、Lint → 成功。

### 4. 操作と画面を確認する
モックログイン後、375pxと1280pxで折りたたみの開閉を確認する。ライト・ダークを確認し、正常・空データ・長い数値のスクリーンショットを保存する。空データと境界値は既存モック操作方法を確認してから投入し、本番にはアクセスしない。

E2Eでは精算額が内訳開閉で変わらないこと、月移動後に新しい月の内訳になることを検証する。

検証: 上表のE2E・全体テスト・ビルド → 成功。目視結果とスクリーンショット所在を記録。

## 完了条件

- [x] 関連・新規・E2Eテストが成功し、上記の金額ケースを網羅する。
- [x] 型検証・Lint・カバレッジ・ビルドが成功する。
- [x] UIの2サイズと2テーマを確認し、根拠を記録する。
- [x] `git diff --name-only` に対象外の変更がない。
- [x] `plans/README.md` の状態を更新する。

## 実装・検証記録（2026-09-04）

作業ブランチ: `feat/settlement-breakdown`。実装開始時のHEAD: `377fbc5`。未コミット変更なしを確認して着手した。

### 現コードとの照合・合意した調整

- 基準 `03ef7db` から月次要約にはAI診断起点が追加されていた。既存起点を保ち、精算額と月収支の間に内訳を追加した。
- 共通 `collapsible.tsx` は `d1a0c15` で削除済み。利用者の承諾により、内訳部品から既存依存 `@radix-ui/react-collapsible` を直接利用した。共通部品の復元・依存追加は不要。
- `calculateMonthBalance` は `src/lib/utils/monthly-summary.ts` にあり、繰越扱いの支出も月収支に含む。内訳は既存 `calculateSettlement` の結果を受け取り、繰越扱い支出・未清算繰越を除外し、清算対象繰越のみを含む。計算関数は変更していない。
- 内訳に限って0.5円を表示し、精算額の符号は方向へ、差引・お小遣いの負数は金額へ反映する。上部・CSVの整数表示は維持。
- `npm ci` でロックファイルの依存を導入し、Next.js 16.3.4の同梱 `use-client` ガイドを確認した。

### 検証結果

| 検証 | 結果 |
|---|---|
| 変更前の関連テスト | 2ファイル・33件成功 |
| 新規部品のRED | 未実装のimport解決失敗を確認 |
| 関連・新規テスト | 3ファイル・45件成功。クリック・Enter・Space、両方向、0円、赤字、空配列、繰越の包含・除外、正負の0.5円を検証 |
| `npx tsc --noEmit --incremental false` | 成功 |
| `npm run lint` | 成功（0エラー）。変更外の `passkey-login-button.tsx:42` に既存の遷移方法の警告1件 |
| `npm run test:coverage -- --maxWorkers=2` | 87ファイル・985件成功。文90.66%、分岐86.49%、関数91.67%、行91.50%。内訳部品の文・分岐・関数は100% |
| `npm run build` | 成功。既存middlewareの非推奨警告あり |
| `npm run test:e2e -- tests/e2e/settlement-breakdown.spec.ts --reporter=line` | Chromium 5件成功。開閉前後の精算額、月移動、2サイズ・2テーマ、空月からの金額追加を検証 |
| 差分レビュー | 計画の7ファイル内のみ。`git diff --check` 成功。計算・保存・CSV・既存レイアウトは変更なし |

初回の全体カバレッジ実行では、変更外の `mobile-entry-actions.test.tsx` のエラー後再操作テストが、非同期のdisabled解除前の検証で1件失敗した。同時実行数を2に抑えた再実行で全件成功した。テスト・実装の対象外修正はしていない。

E2Eは既存のモバイル専用追加フォーム（固定バー→種別選択→保存）とデスクトップの追加フォームを使い分けた。推移はアクセシブルな画像ロールで特定し、スクリーンショットはヒーローの表示金額の確定も待って撮影する。

追加調査で、モーション軽減を指定すると既存 `AnimatedYen` の表示が0円に留まるケースを確認した（内訳とヒーローのアクセシブル名は正しい金額）。同部品は今回の対象外のため変更せず、計画の画面検証は通常のモーション設定で実施する。

### 画面確認・スクリーンショット

`npm run dev:mock` のローカル環境で、375×900と1280×900、ライト・ダークを確認。各組み合わせで通常データ（2026年2月）・空データ（2026年3月）・長い数値（同月へ夫収入999,999,999円を画面から追加）を確認した。本番データへのアクセスはない。

- 内訳の行・符号・担当者色・0.5円の説明が読み取れ、横スクロール・内訳のはみ出しはない。
- トリガーの高さ44px以上、クリックとキーボード操作、`aria-expanded` と `aria-controls` を検証。
- モバイル1カラム、デスクトップ左要約・右明細、月コピー・CSV・AI診断起点・推移グラフを維持。
- スクリーンショットは `test-results/settlement-breakdown-{375|1280}px・{ライト|ダーク}で通常・空・長い数値の表示を検証する-chromium/` 配下の `normal.png`、`empty.png`、`long-fraction.png`（計12枚）。`test-results` はGit管理対象外で、再実行時に更新される。

## STOP条件

- 現状抜粋と実装が変わり、計算上の意味を照合できない。
- API追加や計算・丸め仕様の変更が必要になる。
- 同一検証で合理的な修正を2回試しても失敗する。
- 範囲外のファイル変更が必要になる。黙って範囲を拡大しない。

## Gitと保守

mainへ直接プッシュしない。コミット例: `feat: 精算額の内訳表示を追加`。コミット・PRは日本語、生成情報は付けない。プッシュ・PR作成は依頼された場合のみ。

今後の月締めは同じ内訳表示に確定時の結果を渡す設計を検討する。計算対象繰越と実績支出の違い、0円方向、端数表示をレビューで確認する。
