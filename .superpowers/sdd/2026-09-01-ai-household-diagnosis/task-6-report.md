# Task 6 完了報告: 月次画面のAI診断UI

## 実装結果

- 月次画面のコピー・CSV操作の後ろへ「AIで今月を振り返る」を追加した。
- 既存`ResponsiveModal`を使い、デスクトップはDialog、モバイルはDrawerの契約を維持した。
- 開いた時だけ保存済み診断を読み込み、未保存・保存済み・期限切れ・読み込み失敗を表示する。
- 初回診断、再診断、409、一般エラー、Action reject、再試行成功を扱う。
- 実行中に閉じてもActionを継続し、再度開いた時に同じ状態を表示する。読み込みと生成はクライアントでもsingle-flightにし、重複実行しない。
- 月切替時は古い読み込み・生成のrequest IDを失効させ、古い結果による上書きと進行タイマー残留を防ぐ。
- 3段階の進行文言を完了率なしで順番に表示する。
- AI文章とアプリ計算の金額・差額・率・削減余地を別要素で表示する。
- 4ブロック、期限切れ、参考値、未清算繰越の確認事項、候補なしを表示する。
- AI文章は通常のReactテキストとして描画し、HTMLとして解釈しない。
- 内部カテゴリコードと`person`は表示しない。

## 変更ファイル

- `src/features/ai-diagnosis/index.tsx`（新規）
- `src/features/ai-diagnosis/components/diagnosis-result.tsx`（新規）
- `src/features/monthly-overview/index.tsx`
- `tests/components/features/ai-diagnosis.test.tsx`（新規）
- `tests/components/features/monthly-overview.test.tsx`

## TDD証跡

公開UIを通る縦スライスで、各ケースをRED→GREENにした。

1. 保存済み結果
   - RED: `@/features/ai-diagnosis`を解決できず失敗。
   - GREEN: 保存済み診断を4ブロック、数値根拠、確認事項として表示。
2. 期限切れ
   - RED: 「最新データで再診断」ボタンがなく失敗。
   - GREEN: 古い結果を残したまま期限切れ案内と再診断操作を表示。
3. 未保存
   - RED: 説明と「診断を始める」がなく失敗。
   - GREEN: 開くまでloadせず、未保存時も自動生成しない。
4. 進行状態
   - RED: `role=status`の3段階通知がなく失敗。
   - GREEN: 1秒ごとに3文言を順番に表示し、`aria-live`、`aria-busy`、disabledを付与。
5. 閉じた状態の継続
   - RED: 再度開くとloadが2回呼ばれて失敗。
   - GREEN: 実行を継続し、再取得・再実行を重複させず、Escape後に起点へfocus復帰。
6. 実支出なし
   - RED: disabled理由が表示されず失敗。
   - GREEN: 起点をdisabledにし、画面上の理由と`aria-describedby`を関連付け。
7. 読み込み失敗
   - RED: 安全文言と再読み込み操作がなく失敗。
   - GREEN: load失敗とrejectを固定文言へ閉じ、生成せず再読み込み可能にした。
8. 生成失敗
   - RED: Action rejectで実行ロックとタイマーが残り失敗。
   - GREEN: `try/finally`で必ず解放し、409・一般エラー・reject後も再試行可能にした。
9. 月次統合
   - RED: 月次アクション群にAI診断がなく2テスト失敗。
   - GREEN: コピー→CSVの順を維持して追加し、`202604`と実支出有無を渡した。

最終対象テスト:

- `npm run test:run -- tests/components/features/ai-diagnosis.test.tsx tests/components/features/monthly-overview.test.tsx`
- PASS: 2 files / 22 tests

## UI状態とアクセシビリティ

- 起点・開始・再診断・再読み込み・閉じる操作は44px以上。
- Button既定focus ringを維持し、起点へreduced-motion時のtransition/scale停止を追加した。
- `ResponsiveModal`のfocus trap、Escape、focus復帰を実コンポーネントで維持した。
- 読み込み／実行中は`aria-busy=true`、進行文言は`role=status aria-live=polite`。
- エラーは`role=alert`で、Actionの安全な文言だけを表示する。
- 実支出なしの理由は可視テキストと`aria-describedby`の両方で伝える。
- stale、参考値、確認事項は色だけでなく明示文言と見出しで伝える。
- 本文は`text-base`と`leading-7`、カードは`overflow-x-hidden`、モーダル本文は縦スクロールに限定した。
- Sparklesと状態アイコンはLucide SVGを使い、絵文字・新規フォント・AI紫／桃gradientを追加していない。
- AI文章のXSS文字列をplain textで表示し、`dangerouslySetInnerHTML`は使用していない。
- 空候補の各セクションは隠し、全候補なしは「今月は大きな変化はありません」と表示する。
- 未清算繰越は合計だけを「確認事項」とし、浪費・使いすぎの表現はない。

a11y回帰テスト:

- `npm run test:run -- tests/components/a11y/aria-attributes.test.tsx tests/components/a11y/ux-polish.test.tsx tests/components/features/action-buttons-a11y.test.tsx`
- PASS: 3 files / 15 tests

## 品質ゲート

実施順はbriefどおり。

| 検証 | 結果 |
|---|---|
| 対象テスト | PASS: 2 files / 22 tests |
| a11yテスト | PASS: 3 files / 15 tests |
| 全テスト | PASS: 64 files / 657 tests |
| Coverage | PASS: Statements 88.38%、Branches 82.98%、Functions 87.76%、Lines 89.08% |
| AI診断UI Coverage | `index.tsx` Lines 95.12%、`diagnosis-result.tsx` Lines 100% |
| TypeScript | PASS: `npm run typecheck` |
| ESLint | PASS: `npm run lint`、warning 0件 |
| Next.js build | PASS: `npm run build` |
| Diff check | PASS: `git diff --check` |

本番ビルドはsandbox内でTurbopackの`listen EPERM 127.0.0.1`となったため、同一コマンドを正規の権限昇格で再実行して成功した。既存の複数lockfile警告とmiddleware非推奨警告だけが残り、コンパイル、TypeScript、全8静的ページ生成は成功した。

全テスト／Coverageのstderrには既存の意図的な例外経路テストとskip-link hydration警告があるが、失敗・未処理例外はない。

## 自己レビュー

- loadはopen後に1回だけ開始し、未保存でも自動生成しない。
- closeは生成Actionをキャンセルせず、同じ月の状態を保持する。
- refによるクライアントsingle-flightに加え、月ごとのrequest IDで古い非同期結果を破棄する。
- すべてのタイマーは完了、月切替、アンマウントで解放する。
- 金額・差額・率・削減余地は`AiDiagnosisView`から描画し、AI文章から抽出・計算しない。
- 内部カテゴリ、`person`、夫婦比較、秘密情報を表示・ログするコードはない。
- 他タスクの変更をrevertしていない。
- Task 7のブラウザ目視に備え、通常、未保存、期限切れ、実支出なし、進行、409、一般エラー、空候補、参考値、XSS、focus復帰のコンポーネント契約を固定した。

## 懸念・補足

- 実ブラウザでの375 / 768 / 1024 / 1440幅と通常・空・期限切れ・エラーの目視確認は、計画どおりTask 7で実施する。
- 今回の所有範囲に未解決事項はない。
