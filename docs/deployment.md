# デプロイ

Next.js/OpenNextのroot Worker 1つをCloudflare Workersにホストする。通常のデータアクセスはWorkerのD1 bindingへの直接アクセスで、公開HTTP API Workerは使用しない。デプロイはWorkers Builds（Git連携）による自動デプロイを基本とする。

## 構成

| Worker | 設定ファイル | 内容 |
|--------|------------|------|
| `score-splitter` | `wrangler.jsonc`（root） | 本番のNext.js/OpenNext + 本番D1 `score-splitter` |
| `score-splitter-dev` | `wrangler.jsonc` の `env.dev` | 開発・PR PreviewのNext.js/OpenNext + 開発D1 `score-splitter-db-dev` |
| `score-splitter-api` | `cloudflare/worker/wrangler.jsonc` + `src/index.ts` | 旧HTTP入口。D1ドメイン関数は共有し、安定確認まで切り戻し用に保持 |

## カスタムドメイン（yamawake.app）

Cloudflare Custom Domains（各 `wrangler.jsonc` の `routes` + `custom_domain: true`）で割り当てる。ゾーンが同一アカウントにあるため、deploy時にDNSレコードが自動作成される（対象ホストに既存レコードがあるとdeployが失敗するので事前に空にしておく）。

| ホスト | 割当先Worker | 内容 |
|--------|-------------|------|
| `yamawake.app` | `score-splitter` | ウェイトリストLP（`/` を `/lp` へrewrite） |
| `app.yamawake.app` | `score-splitter` | アプリ本体 |
| `api.yamawake.app` | `score-splitter-api` | 旧HTTP API（rollback-only） |
| `www.yamawake.app` | （Workerなし） | ゾーンのRedirect Ruleで `yamawake.app` へ301 |

- LP/アプリの出し分けは `src/middleware.ts` のホスト判定で行う。apexのアプリ系パスは `app.yamawake.app` へ307、`/lp` の正規URLは `https://yamawake.app/` に一本化（308）。localhost / workers.dev / preview URLは従来挙動
- ホストを跨ぐのはredirectのみ（rewriteは同一ホスト内）なので、Server Actionsの `experimental.serverActions.allowedOrigins` は不要。将来ホスト跨ぎrewriteを導入する場合のみ設定が必要
- `NEXT_PUBLIC_SITE_URL`（LPの `metadataBase` 用）はLPが静的プリレンダリングされるためビルド時に必要。Workers Builds（score-splitter）のビルド変数にも `https://yamawake.app` を設定すること
- www用のDNS（`www` をProxiedでCNAME → `yamawake.app`）とRedirect Rule（`www.yamawake.app/*` → `https://yamawake.app/$1`、301）はダッシュボードで手動設定
- 旧 `score-splitter-api` とそのworkers.dev URLは、一本化後の障害時の切り戻し判断が終わるまで保持する。通常リクエストは旧APIへ送らない

## Workers Builds（Git連携）の設定値

Cloudflareダッシュボード → Workers & Pagesでは、本番と開発を同じGitHubリポジトリに接続した別プロジェクトとして設定する。実行時のWorkerは本番・開発それぞれ1つであり、API Worker用のWorkers Buildsプロジェクトは新設しない。2026-09-05の実環境照合では旧APIのGit連携が残り、PR #120から本番D1をbindingしたPreviewが生成された。後続の世帯対応コードをpushする前に旧APIの非本番ブランチ自動uploadを停止または隔離する。ソース内の設定だけを停止済みの証拠としない。詳細は[世帯分離リリース手順](household-release-runbook.md)を参照。

| 項目 | score-splitter（本番） | score-splitter-dev（開発・PR Preview） |
|------|---------------------------|--------------------------------------|
| Build command（all branches） | `npx opennextjs-cloudflare build` | `npx opennextjs-cloudflare build --env dev` |
| Deploy command（production） | `npx opennextjs-cloudflare deploy` | `npx opennextjs-cloudflare deploy --env dev` |
| Non-production branch deploy command | 設定しない | `npx opennextjs-cloudflare upload --env dev` |

GitHubへpushするとWorkers Buildsが自動実行され、devプロジェクトのPRごとにBranch Alias Preview URLが発行される。PRコメントのBranch Aliasを動作確認に使う。Previewは `score-splitter-db-dev` を共有し、固定の `dev.yamawake.app` は作成しない。パスワードログインと主要な家計操作を確認するが、パスキーUIが表示される場合でも、Preview URLではWebAuthnのRP設定が一致しないため未対応とし、パスキー操作は行わない。

`npm run upload:dev` はGitHub push時の自動PR Previewとは別の手動確認用コマンドで、ローカルの作業内容をVersionとしてuploadし、そのVersion Preview URLで確認する。手動uploadのVersion Preview URLをPRのBranch Alias Preview URLと混同しない。

両プロジェクトともcustom watch pathsは設定しない。設定を変更した場合も、リポジトリ全体をビルド対象とする。これにより `src/**`、`public/**`、`cloudflare/worker/src/**`、`cloudflare/worker/migrations/**`、`package.json`、lockfile、`wrangler.jsonc` などの変更を監視漏れにしない。

## シークレット設定

非シークレット変数（URL・WebAuthn RP設定）は root `wrangler.jsonc` の `vars` で管理。シークレットは以下で設定する:

```bash
# 本番Worker（score-splitter）
npx wrangler secret put APP_PASSWORD_HASH_BASE64
npx wrangler secret put OPENAI_API_KEY

# 開発Worker（score-splitter-dev）。値はGitに保存しない
npx wrangler secret put APP_PASSWORD_HASH_BASE64 --env dev
npx wrangler secret put OPENAI_API_KEY --env dev
```

開発パスワードは本番と共有せず、macOSのキーチェーンアクセスで項目名 `score-splitter-dev`（アカウント `development`）から確認する。平文はGit・PR・ビルド変数へ保存しない。CloudflareにはbcryptハッシュをBase64化した値のみ設定する。

旧API Workerの共有シークレットは切り戻しが必要な期間だけ保持し、新しい通常経路の設定として追加しない。

## AI診断リリース手順

開発のPR Previewで検証してから、明示承認を得てproductionへ進む。診断も通常の家計操作と同じWorkerのD1 bindingを利用し、旧API Workerの公開は不要。

1. 開発D1のmigration一覧を `npx wrangler d1 migrations list score-splitter-db-dev --remote --env dev` で確認する。
2. 開発環境の変更承認後、`npm run migrate:dev` で追加migrationを適用し、pending 0件を再確認する。
3. `score-splitter-dev` の実行時Secret `OPENAI_API_KEY` / `APP_PASSWORD_HASH_BASE64` が存在することを、値を出力せず確認する。AIキーがない場合は診断ボタンを表示しない。
4. devのPRビルドを実行し、Branch Alias Preview URLで以下の項目を確認する。手動確認は `npm run upload:dev` を使い、本番の既定コマンドを流用しない。
5. 本番公開は別途明示承認を得てから行う。「本番バックアップとPRゲート」に従ってバックアップ・実体検証を済ませ、本番D1へ追加migrationを先行適用し、pending 0件と必要Secretを確認してから本番Workerを公開する。

`deploy:worker` / `migrate:worker:remote` は旧APIへ切り戻す場合だけのコマンドであり、devの診断確認には使用しない。

### 開発 / production smoke checklist

- migration statusがpending 0件で、`ai_diagnoses`、`ai_execution_guard`、`ai_diagnosis_source_revision`を参照できる。
- 通常の支出更新（label、amount、繰越切替）が成功し、一覧へ反映される。
- AI診断のcontext取得、lease取得、カテゴリ分類、診断保存が成功する。
- 診断実行中に通常の支出更新を行うと、古い診断保存は409になり、画面の既存結果はstale表示になる。
- AI診断成功後、通常の支出更新と再診断が引き続き成功する。

開発環境の全項目に合格してから、明示承認を得てproductionへ進み、productionでも同じchecklistを実施する。API secretや実OpenAI呼び出しが必要なsmokeは権限を持つ運用担当者が実施する。

## 手動デプロイ

```bash
npm run deploy         # フロントエンド（OpenNextビルド + deploy）
npm run deploy:dev     # 開発Worker（OpenNextビルド + env.dev deploy）
npm run upload:dev     # 手動のVersion Previewへupload（env.dev）
npm run migrate:dev    # 開発D1へmigrationを適用
npm run backup:d1:production -- --confirm-production-d1 <本番D1 UUID> # 本番切替前のバックアップ検証
npm run verify:d1:production-backup -- <manifest.jsonの絶対パス> # 切替直前の実体再検証
npm run preview        # フロントエンドをworkerd上でローカル実行（.dev.varsが必要）
```

### 本番バックアップとPRゲート

本番D1 `score-splitter` には失ってはいけないデータがあるため、本番binding変更や本番デプロイの前に必ずバックアップを取得する。scriptは本番D1 UUIDを照合し、Time Travel bookmark、全量SQL、SHA-256、SQLiteへの一時復元、integrity_check、foreign_key_check、適用済みmigrationに対応する全業務テーブルの集合・件数一致を確認して、Git管理外の `~/Documents/Backups/score-splitter/d1/` にPASS manifestを保存する。

PASS manifestはschemaVersion 3で、適用済みmigration名と照合対象表を記録する。0008時点は15業務表、households追加後は16業務表を対象にする。未知の表・migration、欠番、対象表の欠落、外部キー違反はPASSにしない。旧v2 manifestは再取得が必要。

本番切替の直前には、バックアップ時に表示された絶対パスを使って次を実行する。Git HEADと30分以内の条件に加え、SQL実体の存在・サイズ・SHA-256、Time Travel情報のbookmark、保存rootとバックアップdirの0700、SQL・Time Travel・manifestの0600を再検証する。再検証でもSQLをローカルSQLiteに実復元し、schema・件数・整合性・外部キーを再照合する。相対パス、固定保存root外、規定より深いパスは拒否され、このモードはCloudflareへ接続しない。

```bash
npm run verify:d1:production-backup -- ~/Documents/Backups/score-splitter/d1/<UTC日時>/manifest.json
```

本番PRは最初からDraftで作成し、Preview確認とバックアップscriptのPASS、ユーザーの明示承認が揃うまでReady for reviewへの変更・merge・本番デプロイを禁止する。Time Travel restoreは自動実行せず、データ破損時にユーザーが明示承認した場合だけ実施する。

## 本番Workerの改名（score-splitter-web → score-splitter）

この節は既存Workerの改名を実施するための手順であり、実施済みの証跡ではない。上記の構成表は改名後の設定を示す。**本番側の変更とPRマージは、Draft PR・検証結果・下記の切り戻し条件を提示して一連の切替の明示承認を得てから行う。** 改名前に新名の設定で `deploy` / `upload` / `secret put` を実行しない。

### 対象と事前検証

| 対象 | 固定値・照合条件 |
|------|----------------|
| アカウント | Bluespec: `3d344e1896b7e38a3c7a090ce869eb9d` |
| Worker ID | `e0c169b330554062ae1d2740c6a15f4b`（改名前後で不変） |
| 旧名 → 新名 | `score-splitter-web` → `score-splitter`（実行直前にも新名が未使用か確認） |
| 直近の既知Version | `b4e3a265-ab9a-45df-b94f-ac48a727a250`、100%。実行前に再取得し、差異があれば原因と切替対象を確認してから進む |
| 本番D1 | `score-splitter`: `7f8d3531-a833-4474-84d5-cee3ac98ee96` |
| 維持する公開URL | `https://app.yamawake.app`、`https://yamawake.app` |

1. 最新mainから改名用ブランチを作成し、root `name`、現行資料、テストfixtureを変更する。本番名・両Custom Domain、本番／開発D1分離の設定テスト、middleware・バックアップ回帰テスト、lint、typecheck、CIを通す。本番と開発のOpenNext build・Wrangler dry-runは環境ごとに順番に行い、生成物のWorker名・D1 UUID・routesを照合する。
2. コードレビュー後にDraft PRを作成する。Git連携で生成された実PR Previewが開発D1 `51457bd5-8e0e-4645-ad34-86634285af2c` を使うこと、未認証時のログイン保護、パスワードログインと主要画面を確認する。
3. **PR HEADで新規バックアップを取得し、復元検証をPASSにする。** 対象コマンドは以下。スクリプトが要求するWranglerは `4.107.0` で、JSON出力を抑制する `WRANGLER_LOG=error` は設定しない。保存先は承認済みの `/Users/aa00037-tanaka/Documents/Backups/score-splitter/d1/` とし、SQL・Secret・認証情報をGitやPRに載せない。

```bash
CLOUDFLARE_ACCOUNT_ID=3d344e1896b7e38a3c7a090ce869eb9d npm run backup:d1:production -- --confirm-production-d1 7f8d3531-a833-4474-84d5-cee3ac98ee96
npm run verify:d1:production-backup -- <今回生成したmanifest.jsonの絶対パス>
```

PR HEADのPASSを含む検証結果と、次の変更順序・停止条件・切り戻しを提示して承認を得る。このバックアップを後述するマージ後のバックアップに流用しない。

### 承認後の変更順序

1. **状態を記録する。** 対象IDのWorker名・tag、稼働Versionと配分、そのVersionのbindings（本番D1 UUIDとSecret名）、両Custom Domainの割当、Git連携先・本番ブランチ・Build/Deploy command・非本番ビルド無効を再取得する。Workerの最新設定だけでなく、実際に100%配信中のVersionを確認する。開発WorkerのVersion・DB・PR Previewも記録し、切替中は対象外のmain更新を止める。
2. **本番自動デプロイを保留する。** Dashboardの対象本番Worker → Settings → Buildで現在のDeploy command全体を保存する。通常は `npx opennextjs-cloudflare deploy`。Deploy command全体を `node -e 'console.error("本番Worker改名作業中のためデプロイを保留"); process.exit(1)'` へ一時置換する。Build commandの `npx opennextjs-cloudflare build` は維持し、開発側は変更しない。保存後に再読込して確認し、変更前から進行中・待機中のBuildを終端状態まで待つ。現mainのBuildをRetryし、OpenNext build後に保留コマンドで意図どおり失敗すること、稼働Versionが変わらないことを確認する。保留設定を確認できない場合はマージしない。
3. **PRをマージする。** マージで起動した本番Buildも保留コマンドで停止し、進行中・待機中の本番Buildが残っていないことを確認する。最終マージSHAを記録し、ローカルのGit HEADをそのSHAへ合わせる。mainが別SHAへ進んだ場合は切替を止めて対象を再確認する。
4. **最終SHAで全量バックアップを取り直す。** 上記の同じ取得コマンドで新規に取得し、Time Travel情報・全量SQL・ローカル復元・適用済みschema全業務テーブルの件数照合をPASSにする。改名直前に新しいmanifestを指定して再検証し、Git HEAD一致、バックアップ完了から30分以内、SQLのサイズとSHA-256、ディレクトリ0700・各ファイル0600を確認する。不一致・期限超過時は新規取得からやり直す。
5. **同一Workerの名前だけを更新する。** [Edit Worker API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/edit/) にBluespecの認証を使い、次のPATCHを送る。認証ヘッダーの値を出力・保存しない。PUTや新名へのdeployでWorkerを作成しない。省略した属性は変更されない部分更新を使う。

```http
PATCH https://api.cloudflare.com/client/v4/accounts/3d344e1896b7e38a3c7a090ce869eb9d/workers/workers/e0c169b330554062ae1d2740c6a15f4b
Content-Type: application/json

{"name":"score-splitter"}
```

6. **改名直後の状態を照合する。** 同じURLをGETし、ID・tagが同じで名前だけ変わったことを確認する。新名のdeploymentsと稼働Version詳細から従来Versionが100%のままで、D1 UUIDとSecret名が事前記録に一致することを確認する。両Custom Domainが同じWorkerを指し、LP公開とアプリの未認証リダイレクトが正常であることを確認する。既存DNSやCustom Domainを削除・再作成しない。PATCHの失敗・タイムアウト・応答不明時も同一IDのGETで状態を確定し、後続デプロイは止める。
7. **Git連携デプロイを再開する。** Git連携が同じWorkerに残り、本番mainのみ・開発の各 `--env dev` が維持されていること、mainとローカルHEADが最終マージSHAであること、新しいmanifestの再検証PASSを確認する。期限超過なら再取得する。その後、保存した元のDeploy command全体を復元して保存・再読込する。マージSHAに対応するBuildをIDとコミットで特定してRetryする。Retry時には再実行時点の設定が適用されるため、元コマンドで新名へデプロイされたことを実Buildのログと結果で確認する。[Build settingsの仕様](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#build-settings)
8. **完了確認する。** 成功BuildのマージSHA・生成Version・本番100%稼働を照合し、D1 UUID・Secret名・両公開URL・認証保護を再確認する。開発Worker・開発DB・実PR Previewの動作が維持されていることも確認し、最後にユーザーが本番ログイン、既存データ表示、利用中のパスキーを確認する。

Buildの待機時間・ビルド所要時間を含め、実際のdeploy開始までバックアップ完了から30分以内を維持する。期限を超えそうな場合はdeployに進む前に対象Buildをcancelし、保留コマンドを維持または再設定して保存・再読込する。進行中・待機中のBuildが終端状態になったことを確認し、同じ対象SHAで新規バックアップ・再検証を行ってから手順7を再実行する。

Worker ID、Version詳細、Deployments、Custom Domains、Build IDと対象SHAを照合できる証跡を残す。Secretは名前のみ扱う。改名に伴う `workers.dev` と本番Version PreviewのURL変更は許容するが、アプリ・LPの公開URLとWebAuthnのRP設定は維持する。

### 改名時の停止・切り戻し

| 発生段階 | 対応 |
|----------|------|
| PRマージ前の検証・Build保留に失敗 | マージせず、Worker・稼働Version・mainの設定が従来のままであることを確認する。revert PRは不要。中止時は進行中・待機中のBuildを終端状態にし、保存した元Deploy commandを復元して保存・再読込する |
| PRマージ後・改名前の検証に失敗 | 旧名・旧Versionで提供を続けて保留を維持する。中止時はrevert PRをマージし、Gitの設定名と実Worker名が旧名で一致してから、下記のバックアップゲートを通して再開する |
| PATCHの失敗・応答不明 | 同一IDをGETして状態を確定する。旧名ならそのまま、新名なら改名直後の照合を行う。状態を確認できない間はPATCH再試行・deployを行わず、保留を維持する |
| 改名直後にドメイン・認証・bindingなどの異常 | 承認済みの切り戻し条件に従い、同じIDのPATCH本文を `{"name":"score-splitter-web"}` にして旧名へ戻す。旧名・事前Version・bindings・ドメインを照合する。revert PRでGit側も戻すまで保留を解除しない |
| Git連携の再デプロイ失敗 | 稼働Versionを確認し、旧Versionが継続中なら提供状態を維持する。元Deploy commandを再び保留コマンドへ置換して保存・再読込し、進行中・待機中のBuildを終端状態にして原因を調べる |
| 再デプロイ後の動作異常 | 自動デプロイを再保留してBuildの終端を確認し、直前に有効なバックアップを再検証する。不一致・期限切れなら新規取得する。その後 `npx wrangler rollback <事前に記録したVersion ID> --name score-splitter` で同じWorkerを事前Versionへ戻す。Version rollbackは改名取消ではない。名前も戻す場合は同一IDのPATCHとrevert PRを別途行い、実Worker名とGit設定名が一致してから再開する |

revert PRをマージしてデプロイを再開する場合も、ローカルHEADをその最終マージSHAへ合わせて新規バックアップを取得する。再開直前にHEAD一致・30分以内・権限・SHA-256を再検証し、PASS後に元Deploy commandを復元して該当SHAのBuildをRetryする。Version rollback直前の再検証でも同じ条件を満たすことを確認し、期限切れの場合は新規取得する。

いずれの切り戻しもD1のrestoreやmigrationは行わない。開発構成・開発Secret、本番Secret、共有Build tokenの名前や権限、旧API Worker・URL・Secret、default/goaltech-zeroの認証プロファイルは今回変更しない。

## 旧APIへの切り戻し

一本化後のroot Workerで障害が発生した場合は、まず `score-splitter` を問題発生前のVersionへ戻す。対象Versionは事前に `npx wrangler deployments list --name score-splitter --json` で確認し、バックアップPASSとユーザーの明示承認後に次を実行する。

```bash
npx wrangler rollback <旧Version ID> --name score-splitter
```

旧HTTP APIへ切り戻す必要がある場合の前提は、`api.yamawake.app` のCustom Domain routeが `score-splitter-api` に残っていること、`cloudflare/worker/wrangler.jsonc` が本番D1 `score-splitter`を指すこと、API側secret `WORKER_API_TOKEN` とroot側secret `CLOUDFLARE_WORKER_API_TOKEN` が同じBearer値であること。旧API Workerを再デプロイする場合は次を使う。

```bash
npx wrangler secret put WORKER_API_TOKEN --config cloudflare/worker/wrangler.jsonc
npx wrangler secret put CLOUDFLARE_WORKER_API_TOKEN
npx wrangler deploy --config cloudflare/worker/wrangler.jsonc
```

旧API経路を使う旧root Versionへ戻した後だけ、rootのrollback-only変数 `CLOUDFLARE_WORKER_API_URL=https://api.yamawake.app` とBearer secretが有効になる。復旧後はroot Workerを最新Versionへ戻し、旧APIの再デプロイ・secret変更が必要だった場合は履歴へ記録する。D1 restoreは別操作であり、自動で行わない。

## ドメイン変更時のパスキー再登録

WebAuthnのパスキーはRP ID（ドメイン）に紐づくため、ホスティングドメインが変わると既存パスキーは無効になる。パスワードでログインし直し、`/settings` からパスキーを再登録する。旧ドメインのパスキーはD1の `passkey_credentials` に残るが認証にはマッチしないため無害（気になる場合は設定画面から削除）。

## Vercelからの移行メモ（2026-07）

- フロントエンドはVercelホスティングから本構成（OpenNext + Workers Builds）へ移行済み
- Vercel廃止手順: Git連携を解除 → Cloudflare側の安定稼働を確認 → Vercelプロジェクトを削除
- Vercelに旧Worker APIトークンを設定していた場合は、旧APIの安定確認・廃止時に `WORKER_API_TOKEN` / `CLOUDFLARE_WORKER_API_TOKEN` をローテーションまたは削除する

## 振込記録機能の移行

アプリ公開前に `0008_add_payment_records.sql` を対象D1へ適用する。既存明細・既存支払なしの月は変更せず、振込履歴なしとして扱う。ローカルの `npm run test:d1:payment` → 開発DBへのmigrationとアプリ → 開発画面確認 → 既存の本番バックアップ手順 → 本番migrationとアプリ、の順で進める。

障害時は振込UIを公開しないアプリへ戻せる。記録済みの台帳やrevisionをDROPせず、支払開始後の無条件DB復元は行わない。旧アプリに戻しても家計明細は編集できる。HTTP互換の振込経路は内部Bearerに加え `x-household-session` に有効な世帯セッションを要求する。
