# Task 7 完了報告: モック、E2E、設定、文書、最終検証

## 実装結果

- `dev:mock`は`AI_PROVIDER=mock`を必須とし、比較・分類・文章生成を決定的なモックだけで完結する。Playwright実行中のOpenAI API呼び出しは0件。
- MSWへ本番Workerと同形の6エンドポイントを追加した。context取得、保存済み取得、2分lease取得、`expectedLabel`付き分類保存、`runToken`付き診断保存、lease解放を再現した。
- lease競合、分類の楽観的競合、run token fence、保存結果再利用、label変更時だけ分類無効化する契約をモックAPIテストで固定した。
- 2025-11〜2026-02の4か月比較データを追加し、2026-02の外食は過去平均12,000円から18,000円へ増加するようにした。差額6,000円・増減率50%で両閾値を超える。
- 通常Expense APIは`person`以外にAI内部3列も応答から除外し、label変更時にだけAI分類を無効化する。
- 月内の家計データが更新された場合は診断UIを再読み込みし、保存結果のstale状態をその月のまま反映する。
- モバイルDrawerの縦スクロール所有者を1つにし、`overscroll-contain`を付与した。desktop側はDialog内容を従来どおり独立スクロールにしている。

## TDD証跡

1. E2EのRED
   - `tests/e2e/ai-diagnosis.spec.ts`を先に追加し、contextルート未実装のため診断開始まで到達せず失敗することを確認した。
2. モックAPIのRED
   - 6ルートの契約テストを先に追加し、MSWが未処理リクエストとして失敗することを確認した。
3. DrawerのRED
   - mobile固有テストで`.overflow-y-auto`が2要素ある失敗を確認した。
4. 回帰テスのRED
   - 通常APIの内部列非公開、14カテゴリ一致、provider安全分岐、hash/version単独stale、narrative送信境界の不足を各focused testで確認した。
5. フルE2EのREDと安定化
   - 最初の全E2Eは診断シナリオ内の支出更新が後続specへ残り、既存精算額テスト1件が失敗した。シナリオ末尾で元データへ戻し、最終52/52件成功を確認した。
   - SSR直後のクリックがhydration前に消失する1回の再現を受け、画面遷移後は`networkidle`で実操作可能な状態を待つようにした。任意の固定時間waitは使用していない。

## Deferred Minor回収

| 発生Task | 回収内容 | 検証 |
|---|---|---|
| Task 2 | 通常Expense APIがAI内部列を露出しない | mock API直接回帰 |
| Task 2 | migrationとWorkerの固定14カテゴリ一致 | migration SQLと共通ソースの契約テスト |
| Task 3 | allowlistの3箇所重複 | 軽量な`categories.ts`に集約しdomain/Worker/store/MSWから共有 |
| Task 4 | prompt injection、positive種別、dataSufficiency不一致、refusal/空出力 | 独立provider回帰テスト |
| Task 5 | hashのみ/versionのみstaleとload/run | Action統合テスト |
| Task 5 | narrativeへrecord ID/person sentinelを送らない | Action境界の送信payloadテスト |
| Task 6 | Drawer二重scroll、overscroll、mobile契約 | componentと実ブラウザの両方で確認 |
| Task 6 | fake timer復元と残存timer | 既存`afterEach`/unmount回帰を維持し、全suite成功を確認 |

未回収のDeferred Minorはない。

## 本番設定と文書

- root `wrangler.jsonc`の非秘密varsに`AI_PROVIDER=openai`、分類/文章モデルとも`gpt-5-mini`を設定した。deprecatedな`gpt-5-mini-2025-08-07`は実行設定にない。
- `OPENAI_API_KEY`はJSON/JSONC/`NEXT_PUBLIC_*`/ブラウザコードへ記載せず、`npx wrangler secret put OPENAI_API_KEY`だけで設定する手順とした。
- `docs/configuration.md`へlocal、mock、production、`store:false`、OpenAI組織側の保持設定、key rotation、失敗時の保存済み診断表示、現行snapshotでの固定方法を追記した。
- `docs/database.md`へAIカテゴリ3列、`ai_diagnoses`、2分lease、run token、label変更時のみ無効化、通常APIでの内部情報非露出を追記した。
- `npm run cf-typegen`で`cloudflare-env.d.ts`を更新した。型生成自体は成功したが、sandbox外のWrangler logへの書き込みに`EPERM`警告が出た。

## 実ブラウザと目視結果

Playwrightが`npm run dev:mock`を起動・終了する構成で検証した。検証後にTCP 3000のLISTENプロセスがないことを確認した。

- 初回診断: 3段階「支出を整理しています」→「過去の傾向と比較しています」→「振り返りを作成しています」を実ブラウザで順に確認した。進行中にEscapeで閉じて再度開いても同じrunが継続し、重複生成はない。
- 結果: 4ブロック、支出総額/過去平均/差額/率、外食6,000円増・50%を確認した。「夫の支出」「妻の支出」は0件だった。
- 保存再表示: close/reopen後は開始画面へ戻らず、保存済みの4ブロックを即時表示した。
- stale: 外食を18,000円から25,000円へ更新後、古い結果を残して「家計データが更新されています」と「最新データで再診断」を表示し、明示操作後にstaleが解消した。
- 空月: `/2026/03`で起点がdisabled、「実支出がある月で利用できます」が可視だった。
- desktop 1440x900: 中央Dialogは幅512pxに収まり、背景との階層、見出し、数値、閉じる操作がlight/darkで識別できた。Escape後は起点へfocusが戻った。
- mobile 390x844: 下端Drawerは画面内に収まり、日本語文章はカード幅内で折り返された。縦scroll所有者1つ、`overscroll-behavior-y: contain`、document横overflow 0pxを実測した。起点は44x44px以上、Escape後のfocus復帰も確認した。
- light/darkのコントラスト、境界線、金額、背景オーバーレイに表示崩れはない。開発ツールのバッジは証跡から除外し、秘密値・個人比較は写っていない。

スクリーンショット:

- `screenshots/desktop-light.png` — 1440x900
- `screenshots/desktop-dark.png` — 1440x900
- `screenshots/mobile-light.png` — 390x844
- `screenshots/mobile-dark.png` — 390x844

## セキュリティ自己監査

- `OPENAI_API_KEY`の`src/**/*.tsx`、JSON/JSONC、`NEXT_PUBLIC_*`への混入: 0件。
- `dangerouslySetInnerHTML`のAI診断機能内使用: 0件。
- `gpt-5-mini-2025-08-07`の実行設定: 0件。設定文書の「使用しない」という記述のみ。
- OpenAI narrative payloadは集計値と候補だけで、fixture record ID、`person`、`husband`、`wife`、収入label、認証情報を含まないことをproviderとAction境界の両方でテストした。provider内の夫婦語は応答拒否用の安全検査にだけ存在する。
- `npm audit --omit=dev --audit-level=high`: High 4件。Task 4の確定baselineと同数で、Task 7はpackageを変更せず本番Highを増やしていない。既存のnanoid/Next.js/postcss/sharp advisoryは別途更新が必要。

## 品質ゲート

| 検証 | 結果 |
|---|---|
| RED後のfocused tests | PASS: 126 tests |
| 全unit/integration/component | PASS: 66 files / 678 tests |
| Coverage | PASS: Statements 88.81%、Branches 83.66%、Functions 88.29%、Lines 89.53% |
| TypeScript | PASS: `npm run typecheck` |
| ESLint | PASS: `npm run lint`、warning 0件 |
| Next.js build | PASS: `npm run build` |
| OpenNext/Cloudflare build | PASS: `npx opennextjs-cloudflare build` |
| AI診断E2E | PASS: 6/6 |
| 全E2E | PASS: 52/52 |
| 指定解像度画像生成 | PASS: 4/4 |
| Diff check | PASS: `git diff --check`、`git diff origin/main...HEAD --check` |
| dev server終了 | PASS: TCP 3000 LISTENなし |

Next/OpenNext buildはsandbox内でTurbopackの`listen EPERM 127.0.0.1`となるため、同一コマンドを正規の権限昇格で再実行して成功した。既存の複数lockfile警告、middleware非推奨警告は残るが、コンパイル、型検査、静的ページ生成、OpenNext bundleは成功した。

## 自己レビュと残件

- 6ルートのrequest/response/statusはTask 3のWorker契約と整合している。
- 共通カテゴリソースはReact/Next/OpenAI SDKをimportせず、Workerビルド境界を維持する。
- スクリーンショットを4枚目視し、アニメーション途中の証跡と開発バッジ写り込みを検出・再撮影した。
- 他タスクの変更をrevertしていない。
- Task 7所有範囲に未解決のImportant/Minorはない。依存性High 4件と既存警告は今回の差分外の既知事項である。
