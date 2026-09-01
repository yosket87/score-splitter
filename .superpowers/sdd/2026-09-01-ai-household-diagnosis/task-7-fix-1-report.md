# Task 7 修正ラウンド1報告

## 結果

`task-7-review.md`のImportant 5件をすべて修正した。MSWと本番Workerのwire contractを1つの軽量validatorと共通request tableで固定し、本番Expense応答、保存済み診断の再利用、モバイルDrawer、Data Controls文書を回帰検証した。残存Importantは0件。screenshot証跡生成と視覚回帰テストの分離は、既存ledgerどおり今回対象外とした。

## TDD証跡

1. strict wireの共通request tableを先にMSWへ流し、19件中14件がREDになることを確認した。不正月、壊れたJSON、未知key、`person`混入、必須欠落、URL/診断月不一致、不正保存metaが200/409/500等になっていた。
2. 後続assignmentの競合前に先行assignmentが更新されるREDを固定し、全件のID/ラベル検証後にのみmutationするよう変更した。
3. モバイルcomponent testは名前付き閉じるbuttonが見つからずRED。`DrawerClose`実装後に44pxとfocus復帰をGREENにした。
4. 保存再利用E2Eはmock stats endpointが404でRED。mock限定ledgerを追加し、reload前後で分類provider/文章provider/PUTが`1/1/1`のままであることをGREENにした。
5. 本番Expenseの実経路は、AI内部3列を持つ専用FakeD1 rowを追加した時点で公開形がすでに正しくGREENだった。これは本番不具合ではなく不足していた回帰テストの回収である。

## Important 5件の修正

### 1. MSW 6 endpointのstrict wire contract

- `src/features/ai-diagnosis/wire.ts`に、React/Next/OpenAI SDK非依存のstrict parserを抽出した。
- **修正ラウンド2での訂正**: ラウンド1完了時点では、saved GETは受信月だけが共通validator対象で、MSWの保存済み`result_json`/必須metaは未検証だった。現在は本番Worker/MSWの両方が保存済み診断に`parseDiagnosisView`を使い、`input_hash`/`analysis_version`も必須として検証する。
- 15件の同一request tableを本番`handleRequest`とMSWへ流し、すべて400で拒否することを確認した。Workerは不正request時のDB実行0件も検証した。
- MSW分類は全assignmentのwire/ID/expectedLabel検証が通った後だけ一括mutationする。後続競合時は409で、先行更新は0件。

### 2. 本番通常Expense API非露出

- AI内部列`ai_category`/`ai_category_source`/`ai_categorized_at`を持つFakeD1 rowで実`handleRequest('/expenses?month=202601')`を通した。
- 応答keyは`amount, createdAt, id, isCarryover, label, month, person`と完全一致し、snake_case/camelCaseのAI内部列が0件であることを検証した。既存MSW非露出テストも維持した。

### 3. 保存再利用E2E

- 初回診断完了後に`page.reload()`でReact local stateを破棄し、再openした。
- 保存済みの「今月のまとめ」「気になった変化」「よかった点」「来月のヒント」が直接表示され、開始buttonなし、進行statusなしを確認した。
- mock request ledgerの分類provider/文章provider/診断PUTは初回生成後もreload再表示後も`1/1/1`で、重複生成は0件。endpointは`USE_MOCKS=true`でのみ200とし、通常環境は404になることもintegration testで固定した。

### 4. mobile Drawerの閉じる操作

- 全`ResponsiveModal`利用箇所のmobile Drawer headerに`DrawerClose asChild`の`button`を追加した。`aria-label="閉じる"`、`size-11`で44x44px。
- component testと390x844実ブラウザE2Eでrole/nameから操作し、閉じた後に起点buttonへfocusが戻ることを確認した。
- 既存のDrawerスクロール所有1つと`overscroll-contain`を維持し、desktop DialogのEscape/focus回帰と既存ResponsiveModal利用テストも全件通過した。

### 5. Data Controls文書

`docs/configuration.md`で次を別項目として記載した。

- APIデータは明示opt-inしない限り学習に利用されない既定だが、対象組織の実設定は管理者が確認すること。
- Responses APIの`store:false`によるapplication stateとabuse monitoring logsは別の制御であること。
- abuse monitoring logsは既定で顧客コンテンツを含む場合があり、原則最大30日と例外があること。
- ZDR/MAMは適格性、事前承認、追加要件があり、承認後も組織/project単位の実設定確認が必要なこと。
- 組織がZDR/MAMと断定せず、OpenAI Platformの`Settings → Organization → Data controls`と[OpenAI公式 Data Controls](https://developers.openai.com/api/docs/guides/your-data)を確認手順とした。

## 実ブラウザとスクリーンショット

- AI診断対象E2E 6/6で、通常生成、reload後の保存再表示、stale後の明示再診断、空月、390x844 Drawer、1440x900 Dialogを確認した。
- mobile light/darkは修正後に再撮影し、両方を原寸で目視した。右上の閉じるXが明確、title/説明と重ならず、日本語がカード幅内で折り返され、light/darkの境界・文字・overlayに崩れはない。
- screenshotにAPI key、認証情報、個人別比較は含まれない。desktop 2枚は既存を維持し、mobile 2枚だけ閉じるbuttonを含む証跡へ更新した。

| 画像 | 寸法 | 結果 |
|---|---:|---|
| `screenshots/desktop-light.png` | 1440x900 | 維持 |
| `screenshots/desktop-dark.png` | 1440x900 | 維持 |
| `screenshots/mobile-light.png` | 390x844 | 再撮影・目視PASS |
| `screenshots/mobile-dark.png` | 390x844 | 再撮影・目視PASS |

## 品質ゲート

| 検証 | 結果 |
|---|---|
| focused | PASS: 8 files / 188 tests |
| 全unit/integration/component | PASS: 67 files / 713 tests |
| Coverage | PASS: Statements 88.84%、Branches 83.87%、Functions 88.38%、Lines 89.74% |
| TypeScript | PASS: `npm run typecheck` |
| ESLint | PASS: `npm run lint`、warning 0件 |
| Next.js build | PASS: `npm run build` |
| OpenNext build | PASS: `npx opennextjs-cloudflare build` |
| Worker dry-run | PASS: upload 53.52 KiB / gzip 10.67 KiB |
| AI診断E2E | PASS: 6/6（31.1秒） |
| 全E2E | PASS: 52/52（1.5分） |
| screenshot | PASS: 4枚の寸法確認、mobile 2枚再撮影・目視 |
| diff | PASS: `git diff --check` |
| dev server | PASS: TCP 3000 LISTENなし |

Next/OpenNext buildの最初のsandbox内実行はTurbopackの`listen EPERM 127.0.0.1`で停止したため、同一コマンドを正規の権限で再実行して成功した。Playwrightの最初のsandbox内実行もwebServerの`listen EPERM 0.0.0.0:3000`のみで、権限内の再実行は全件成功した。

## セキュリティ監査

- `OPENAI_API_KEY`のJSON/JSONC/TSX/JSX混入: 0件。root `wrangler.jsonc`は`AI_PROVIDER=openai`と両モデル`gpt-5-mini`の非秘密varsのみ。API keyは`wrangler secret put`手順だけとした。
- `NEXT_PUBLIC_*`へのOpenAI秘密混入: 0件。AI診断経路の`dangerouslySetInnerHTML`: 0件。
- deprecated snapshotは実行設定に0件。旧planと「使用しない」という文書記載にのみ残る。
- `npm audit --omit=dev --audit-level=high`: High 4件。既定baselineと同数のnanoid/Next.js/postcss/sharp advisoryで、package差分はない。修正には現行指定範囲外のNext.js 16.3.4を含む更新と独立検証が必要なため、今回は自動fixしていない。

## 最終差分監査

- 他タスクの変更をrevertしていない。
- 5修正の所有範囲とmobile screenshot 2枚だけを変更した。
- 本修正による未解決Importantは0件。既知High 4件、Next.jsの複数lockfile/middleware非推奨warning、分離済みscreenshot回帰Minorは従来のledger管理を維持する。
