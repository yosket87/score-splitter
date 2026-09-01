# Task 7 修正ラウンド2報告

## 結果

`task-7-rereview-1.md`の未解決Important 1件を修正した。MSWの保存済みGETは、本番Workerと同じく診断bodyと必須metaを検証する。受信request不正は400、保存データ破損は500とし、bodyも本番と一致させた。

## TDD証跡

1. `person`が混入した診断をmock DBとFakeD1にseedする共通GETケースを追加した。FakeD1/Workerは500、MSWは200となるREDを確認し、MSWで`parseDiagnosisView` failureを内部エラー500へ変換してGREENにした。
2. `input_hash: null`を次の共通ケースに追加し、Worker 500/MSW 200のREDを確認後、MSWの必須meta検証を追加した。
3. `analysis_version: null`も独立にREDを確認後、MSWの必須meta検証を完成した。
4. 正常200と、壊れたrowがseed済みでも不正月を先に400とするケースを同じtableへ加え、受信不正と保存破損の優先順位も固定した。

## GET契約

`tests/fixtures/saved-diagnosis-get-cases.ts`の同一5ケースを、実`handleRequest`とMSW HTTP handlerへ直接流した。

| ケース | status | body |
|---|---:|---|
| 正常な保存済み診断 | 200 | strict済み`data` |
| `person`混入の診断 | 500 | `{ error: '内部エラーが発生しました' }` |
| `input_hash: null` | 500 | `{ error: '内部エラーが発生しました' }` |
| `analysis_version: null` | 500 | `{ error: '内部エラーが発生しました' }` |
| 不正月request（破損row seed済み） | 400 | `{ error: 'monthが不正です' }` |

MSWのGETは月を`parseAiDiagnosisMonth`で検証した後、rowがあれば`input_hash`/`analysis_version`のstring必須を確認し、`result_json`を`parseDiagnosisView`でstrict検証する。保存rowの検証失敗は`AiDiagnosisWireError`用の400 handlerへ流さず、本番同形の500を直接返す。

## 品質ゲート

| 検証 | 結果 |
|---|---|
| focused GET契約 | PASS: 2 files / 94 tests |
| 全unit/integration/component | PASS: 67 files / 722 tests |
| Coverage | PASS: Statements 88.88%、Branches 83.94%、Functions 88.38%、Lines 89.79% |
| TypeScript | PASS: `npm run typecheck` |
| ESLint | PASS: `npm run lint`、warning 0件 |
| Next.js build | PASS: `npm run build` |
| Worker dry-run | PASS: upload 53.52 KiB / gzip 10.67 KiB |
| AI診断関連E2E | PASS: 6/6（31.3秒） |
| diff | PASS: `git diff --check` |
| dev server | PASS: TCP 3000 LISTENなし |

Next.js buildとPlaywrightは、sandboxのlisten制約を避ける正規の権限内実行で成功した。複数lockfileとmiddleware非推奨warningは既知であり、今回の差分による新規warningはない。

## 報告訂正

`task-7-fix-1-report.md`の「saved GETも本番Worker/MSWで同じvalidatorを使う」というラウンド1時点の誤った主張を訂正した。ラウンド1完了時点で共通化されていたのはsaved GETの受信月だけで、保存済みbody/metaは未検証だった。本ラウンドで現在の実装と報告を一致させた。
