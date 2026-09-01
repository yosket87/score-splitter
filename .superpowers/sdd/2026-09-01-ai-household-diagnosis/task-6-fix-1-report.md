# Task 6 修正ラウンド1 完了報告

## 修正結果

レビューのImportant 4件をすべて修正した。

1. 進行通知
   - 3段階の`role=status aria-live=polite aria-atomic=true`を`aria-busy`領域の兄弟へ分離した。
   - live regionを同一DOM要素のまま更新し、各段階が通知対象になる契約を固定した。
2. 月変更・unmount race
   - `currentMonthRef`をrender同期し、load/runごとの`requestMonth`、request ID、mounted guardで完了結果を検証する。
   - 状態を月付きdiscriminated unionにし、描画時点で現在月と一致しないsnapshot/errorを表示しない。
   - 月変更とunmountのcleanupでload/run ID、single-flight、進行timerを失効する。
   - open時だけloadし、close中のrun継続と同月の重複防止は維持した。
3. 未信頼長文
   - `overflow-x-hidden`による隠蔽を削除し、結果ルート・section・itemへ`min-w-0`を追加した。
   - label、summary、commentaryへ`overflow-wrap:anywhere`を付与した。
4. 責務分割
   - 非同期状態機械を`useAiDiagnosis`へ抽出した。
   - `idle/loading/loadError/empty/saved/running`のdiscriminated unionで不可能状態を削減した。
   - `LoadingState`、`LoadErrorState`、`EmptyDiagnosisState`、`SavedDiagnosisState`、`DiagnosisProgress`へ表示を分割した。
   - 公開API `AiDiagnosisDialogProps`と`AiDiagnosisDialog`は維持した。

## 変更ファイル

- `src/features/ai-diagnosis/index.tsx`
- `src/features/ai-diagnosis/use-ai-diagnosis.ts`（新規）
- `src/features/ai-diagnosis/components/diagnosis-dialog-content.tsx`（新規）
- `src/features/ai-diagnosis/components/diagnosis-result.tsx`
- `tests/components/features/ai-diagnosis.test.tsx`

## TDD証跡

- live region: `aria-atomic`欠落と`aria-busy`内包でRED、兄弟分離でGREEN。
- 月描画同期: layout probeが前月snapshotを観測してRED、月付き状態とrender同期refでGREEN。
- 月変更load: 遅延Promiseで旧loadが新loadの前／後に完了する2順序を固定。
- 月変更run: 旧runが新月load後に完了しても上書きしない契約を固定。
- unmount: hook単体で実行中unmount後のtimer 0件と遅延Promise完了破棄を固定。
- 長文: 255文字labelと400文字summary/commentaryが`overflow-x-hidden`依存でRED、明示的な折返し指定でGREEN。
- fake timerは`afterEach`で必ずreal timerへ復元する。

## UI・アクセシビリティ

- 進行live regionはbusy subtree外に置き、`aria-live=polite`と`aria-atomic=true`を維持する。
- 読込／実行コンテンツは`aria-busy=true`、エラーは`role=alert`。
- 44px操作、focus、Escape復帰、reduced-motion、ResponsiveModal契約を維持した。
- AI文章はplain textのまま表示し、内部カテゴリ・personを表示しない。
- 長い未信頼文字列は内容を隠さず任意位置で折り返す。
- 既存デザインを維持し、新規font、AI紫／桃gradient、絵文字は追加していない。

## 品質ゲート

| 検証 | 結果 |
|---|---|
| 対象テスト | PASS: 2 files / 28 tests |
| a11yテスト | PASS: 6 files / 29 tests |
| 全テスト | PASS: 64 files / 663 tests |
| Coverage | PASS: Statements 88.77%、Branches 83.55%、Functions 88.19%、Lines 89.44% |
| TypeScript | PASS: `npm run typecheck` |
| ESLint | PASS: `npm run lint`、warning 0件 |
| Next.js build | PASS: `npm run build` |
| Diff check | PASS: `git diff --check` |

本番buildはsandbox内で既知の`listen EPERM 127.0.0.1`となるため、同一コマンドを権限昇格して成功した。既存の複数lockfile警告とmiddleware非推奨警告のみで、コンパイル、TypeScript、全8ページ生成は成功した。

全テスト／Coverageのstderrに既存の意図的な例外経路ログとskip-link hydration警告があるが、テスト失敗や未処理例外はない。

## 差分確認

- 他担当の変更をrevertしていない。
- Task 7へ送られたMinor 3件は今回のブロック対象外として変更していない。
- `currentMonthRef`のrender同期はrace要件に必要なため、理由コメント付きで`react-hooks/refs`を1行だけ局所抑制した。
- 今回の所有範囲に未解決事項はない。
