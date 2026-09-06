# Issue #103: 既存利用者のGoogleログイン移行計画

作成日: 2026-09-06。状態: 実装中（ユーザーが順次実装と開発環境の使用を承認）。本番変更は未承認。

対象: [Issue #103](https://github.com/yosket87/score-splitter/issues/103)。調査基準: `origin/main` の `953ee5c27cfbbfb114fef3b0935ceea7102e4838`。

Issue本文・コメント・関連PR・最新mainを調査した。#103はopen、コメントなし。Google関連PRは見つからなかった。依存の [#102](https://github.com/yosket87/score-splitter/issues/102) はclosedで、PR #119〜#122と本番0012適用・利用確認の完了記録がある。本計画ではその世帯分離を引き継ぐ。今回の本番実状態を再取得したわけではないため、配備開始時には改めて照合する。

作業ツリーのmainは調査時点でorigin/mainより30コミット古い。以下の既存ファイルの行番号はすべて上記コミット基準。実装時は最新mainから作業ブランチを作り、差分と関連PRを再確認する。本ファイル以外の実装変更・環境変更は行っていない。

## 目標と範囲

既存の2人がそれぞれGoogleログインし、同じ既存世帯の家計を継続利用する。個人ID・世帯ID・家計上の担当者を分離し、一般登録は開放しない。新規世帯作成は#104、パートナー招待は#105で扱う。

既存の収入・支出・繰越・AI結果・振込履歴の世帯IDや担当者を付け替えない。Googleへの変更によって金額・精算結果・家計担当者が変わらないことを検証する。独自パスワード、パスワード再設定、新しいパスキー機能は追加しない。

## 調査で確定した変更理由

| 現行箇所 | 現状と計画への影響 |
|---|---|
| [cloudflare/worker/src/sessions.ts:36](https://github.com/yosket87/score-splitter/blob/953ee5c27cfbbfb114fef3b0935ceea7102e4838/cloudflare/worker/src/sessions.ts#L36) | 現在はセッション期限と世帯の存在を検証する。Googleでは有効なユーザーと現在の所属もここで確認する。 |
| `src/lib/household-context.ts:8`、`src/app/actions/payment-status.ts:20` | 後者などは直接getSessionを呼ぶ。requireHouseholdContextだけを修正すると認可経路を取りこぼす。 |
| `src/app/actions/auth.ts:51`、`src/features/passkey/components/register-passkey-form.tsx:28` | パスワードのpersonはnullで、パスキーの担当者は選択入力。旧セッションのpersonは本人確認の根拠にならない。 |
| [cloudflare/worker/migrations/0012_enforce_household_constraints.sql:111](https://github.com/yosket87/score-splitter/blob/953ee5c27cfbbfb114fef3b0935ceea7102e4838/cloudflare/worker/migrations/0012_enforce_household_constraints.sql#L111) | sessionsは世帯必須、認証方式はpassword/passkey限定。個人情報の追加とCHECK制約の拡張が必要。 |
| [cloudflare/worker/migrations/0011_scope_household_data.sql:147](https://github.com/yosket87/score-splitter/blob/953ee5c27cfbbfb114fef3b0935ceea7102e4838/cloudflare/worker/migrations/0011_scope_household_data.sql#L147) | 振込操作のactor_auth_methodにも同じ制限がある。Googleログイン後の振込を成立させるため、台帳の制約変更も必須。 |
| [src/app/[year]/[month]/page.tsx:32](https://github.com/yosket87/score-splitter/blob/953ee5c27cfbbfb114fef3b0935ceea7102e4838/src/app/%5Byear%5D/%5Bmonth%5D/page.tsx#L32) | 旧振込チェックの表示にgetLegacyHouseholdContextを使う。legacy_auth_keyを消して旧ログインを止めると月画面が壊れる。 |
| `scripts/backup-schema.mjs:8,48` | 未知のmigration・業務表を拒否する。新schema対応のバックアップ検証をmigrationより先に準備する。 |
| `tests/helpers/auth-sqlite.ts:9` | 手書きの簡易schemaとPromise.allのbatchで原子性を再現しない。一度きりの移行確定を証明するには実migrationを使う試験が必要。 |

## 認証方式の提案

GoogleのAuthorization Code Flowをサーバー側で処理し、`oauth4webapi`を第一候補とする。既存のD1セッション管理を残し、OAuth/OIDCの処理を小さな専用モジュールに集約する。公式リポジトリはCloudflare Workers対応を明記している。ただし、本アプリのOpenNext/workerd上での動作はPR 1で検証してから採用確定する。[oauth4webapi公式](https://github.com/panva/oauth4webapi)

Arcticは公式サイトで2026年7月の非推奨化が告知されているため採用しない。認証基盤全体の入れ替えは既存セッションと段階移行への影響が大きく、このIssueでは既存の認可構造に合わせる。[Arctic公式](https://arcticjs.dev/)

- スコープは`openid email`。メールは利用者がアカウントを見分ける表示補助に使い、同一人物判定・自動所属・自動連携には使わない。Googleの認証主体は検証済みの`iss / sub`で識別する。[Google OIDC仕様](https://developers.google.com/identity/openid-connect/reference)
- 毎回新しいstate・nonce・PKCE S256 verifierを生成する。短期の認証試行をブラウザのHttpOnly Cookieに結び付け、期限と一度きりの消費を検証する。別ブラウザのcallback、再送、同時callbackは拒否する。
- IDトークンの署名・許可アルゴリズム・issuer・audience・期限・nonceを検証する。必要なazp等の検証もライブラリのOIDC契約に従う。Googleが定めるissuer表記を検証後に正規化し、同じ主体を重複登録しない。
- oauth4webapiでは応答処理だけで署名確認済みと考えず、`validateApplicationLevelSignature()`まで呼ぶ構成を検証する。JWTのdecodeだけで利用者を確定しない。[署名検証API](https://github.com/panva/oauth4webapi/blob/main/docs/functions/validateApplicationLevelSignature.md)
- Discovery・JWKS・token endpointは信頼するGoogle設定に限定する。鍵更新・タイムアウト・通信失敗を扱い、検証失敗時には家計セッションを発行しない。
- callback後の戻り先は固定の同一origin内パスを基本とする。Host、任意のreturnTo、転送ヘッダーからOAuthのcallback URLを作らない。
- Cookieは既存の不透明トークン方式を利用し、HttpOnly・HTTPSでSecure・SameSite=Lax・Path=/・host限定を維持する。認証試行は短期、家計セッションは既存の7日間を初期値とする。callback後は認証試行を破棄し、新しい家計セッションを発行する。
- Googleのaccess/refresh tokenを家計セッションとして使用しない。Google APIの継続利用は不要なのでoffline accessを要求せず、不要なtokenを永続保存しない。code・token・Secretをログやエラー画面に出さない。

## データと認可の設計

以下の名前は実装用の提案。既存migrationは変更せず、0013以降を段階ごとに追加する。

| 対象 | 保存する情報と制約 |
|---|---|
| `users`（新規） | アプリ内の個人ID、有効/停止状態、全端末失効に使う世代、作成日時。Googleのsubを個人IDそのものにしない。 |
| `google_identities`（新規） | user_id、issuer、subject、表示用メール。`UNIQUE(issuer, subject)`。このリリースでは1ユーザーに1Google主体。 |
| `household_memberships`（新規） | 所属ID、user_id、household_id、有効/解除状態、担当者の既定値。FKとユーザー・世帯の一意性を保証する。担当者は権限ではない。 |
| `oauth_login_attempts`（新規） | ブラウザに結び付いた試行、state、nonce、PKCE verifier、期限、処理済み状態。完了・期限切れ後に秘密を含む一時情報を消去する。 |
| `google_migration_requests`（新規） | 検証済みGoogle主体、照合用の短期コード、期限、本人確認と承認・取消・消費の状態、対象の既存世帯・既定担当者、最小限の監査情報。認証試行とは分離する。 |
| `sessions`（既存拡張） | user_id・所属ID・失効世代を追加。併存中は旧方式のuser_idをNULLのまま保持する。Google方式はuserと同世帯の所属を必須にし、DB制約と発行時/取得時の検証を行う。 |
| `households`（既存拡張） | `legacy_auth_disabled_at`等で旧ログイン可否を管理する。既存のlegacy_auth_keyは非認証用途の識別にも必要なので維持する。 |
| `payment_operations`（既存拡張） | googleを認証方式に追加し、新規Google操作のactor_user_idを保存する。過去行の担当者・認証方式・JSONは保持し、個人IDを推測して補完しない。 |

会計担当者の既定値は移行時に本人と確認する。会計担当者を変更しても個人IDや所属権限は変わらず、過去の明細を変更しない。将来の世帯人数・権限・料金のルールはここで固定しない。

認可は共通のセッション取得で、セッション期限・失効世代・ユーザーの有効性・現在の所属・世帯の存在を検証する。解除済み所属、無効ユーザー、未所属者を家計へ通さない。認可結果をリクエストをまたぐ永続キャッシュには置かない。所属解除時は対象セッションを失効させ、再所属によって古いCookieが復活しないようにする。

全端末ログアウトは操作した本人の全セッションを失効させる。パートナーを巻き込まない。失効世代と進行中の認証試行を整合させ、処理中の古いcallbackが失効を取り消す形でセッションを復活させない。

現在の`PaymentRecord.actor: Session`は履歴型として分離する。個人セッションにuser_idを必須化しても、個人IDのない昔の振込履歴を読み取れるようにする。履歴の旧認証方式はGoogle移行後も有効な過去情報として保持する。

## 本人確認を伴う一度きりの移行

2人だけの移行に合わせ、運営の確認付き申請方式を採用する案とする。一般利用者向けの管理画面や自由な招待機能は追加しない。

1. 利用者がGoogleログインする。未知の主体には家計セッション・ユーザー・所属を自動作成せず、検証済み主体を記録した短期の移行申請だけを作る。画面には照合用コードと案内を表示する。申請の推測・大量作成を制限する。申請画面は家計Cookieなしで到達できるようにし、短期の申請専用Cookieをサーバーで検証して本人の申請だけを表示する。
2. 運営が、対面または既存の信頼できる連絡経路で本人とコードを照合する。メール入力や共有パスワードの所持だけで承認しない。
3. 運営専用CLIが申請に記録済みのissuer/subjectを読み、確認済みの本人・既存世帯・既定担当者に限定した短期の許可を付ける。任意の申請コードだけで所属を作れない。許可対象は既存2人分の運用枠に限定する。
4. 利用者が同じGoogle主体で再ログインする。承認済み・未消費・期限内・対象一致を確認し、許可の消費、user/identity/membership、個人セッションの作成をD1の同一batchで確定する。
5. 条件付きUPDATEが0件でもSQLエラーにはならない点を考慮し、消費権を獲得できない処理は同じbatch内で失敗させる。別リクエストで「確認してから消費」する方式にしない。二重送信・競合・途中失敗で一部だけ確定しないことを検証する。[D1 batchの原子性](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
6. 既に登録された主体の通常ログインは既存userへ解決し、有効所属を確認する。消費済みの移行許可から解除済み所属を復活させない。
7. 2人それぞれが別ブラウザまたは実端末で再ログインし、既存の月一覧・明細・担当者・精算額・振込履歴を確認する。運営が確認結果を記録してから旧認証終了へ進む。

Googleアカウントを使えない場合はログイン画面から案内を読めるようにする。Google側の復旧を案内し、解決しない場合は本人確認付きの運営対応とする。再紐づけが必要な場合は、新しい主体での認証と本人確認、旧主体の利用停止、全端末失効、対象userへの一度きりの付け替えを監査付きで行う。メール一致だけの自動復旧や共有パスワードの再開は行わない。

## 環境とcallback

| 環境 | 方針 |
|---|---|
| 本番 | `https://app.yamawake.app/api/auth/google/callback`を固定登録。本番専用OAuthクライアントとSecretを使う。 |
| 開発 | 既存`score-splitter-dev`の固定workers.dev originを実環境で確認して登録する。候補は`https://score-splitter-dev.bluespec.workers.dev/api/auth/google/callback`。本番とは別のOAuthクライアント・Secret・D1を使う。新しいカスタムドメインは前提にしない。 |
| ローカル | `http://localhost:3000/api/auth/google/callback`。実OAuth確認用の登録と、外部Googleへ通信しないモックE2Eを区別する。 |
| 動的PR Preview | 個々のURLを自動callback登録せず、別ホストへtokenを中継する仕組みも追加しない。OAuthの開始・callbackは設定済み固定originのみ許可する。認証済みの画面試験はローカルモックで行い、統合した実OAuthは対象PRの同じSHAを固定開発Workerへ配備して確認する。 |

Google Cloud側の同意画面・公開状態・許可対象の設定を実装時に照合する。Google側のテストユーザー設定だけに家計のアクセス制限を任せず、アプリの移行許可・所属確認で制御する。

`GOOGLE_CLIENT_ID`と固定originは環境設定、`GOOGLE_CLIENT_SECRET`はWorkers Secretへ置く。実行時設定はリクエストコンテキスト内で読む。Next.js側は導入済み`node_modules/next/dist/docs/`の認証・Route Handler・Cookieのガイドに沿って実装する。モック認証の差し替え口は既存USE_MOCKSのテスト起動に限定し、実配備から有効化できる公開パラメーターは設けない。

## 変更ファイル一覧

行番号は調査基準コミット、新規ファイルは候補名。

| 既存ファイル:行 | 具体的な変更 |
|---|---|
| `package.json:11,45`、`package-lock.json` | 検証したOIDCライブラリを追加。認証D1試験・運営CLIのスクリプトを登録。終了段階で不要になった旧認証依存を除去。 |
| `cloudflare/worker/src/sessions.ts:6,17,36` | 認証方式・user/所属の型、発行契約、毎回の所属検証、失効・旧方式停止に対応。 |
| `cloudflare/worker/src/households.ts:13,23` | 旧世帯の識別と旧ログイン可能状態を分離。 |
| `src/lib/api/sessions.ts:19,38,57` | 型・Zod・D1/HTTP/MSW契約を更新。Googleセッション発行は検証済みの内部経路だけに限定。 |
| `src/lib/webauthn/session.ts:21,54,60,101`、`src/lib/household-context.ts:8` | 個人の認証コンテキストを渡す。既存Cookieと共通認可構造を維持。命名整理の大規模な移動は混ぜない。 |
| `src/types/index.ts:15`、`src/types/payment-status.ts:19` | 個人セッションと過去の操作主体の型を分離。 |
| `src/app/actions/auth.ts:22,51`、`src/app/actions/passkeys.ts:43,91,151,179,243,269` | 併存中の旧方式制御、直接呼出しの拒否、最終的なログイン・登録・管理入口の終了。 |
| `cloudflare/worker/src/auth-router.ts:18,55`、`authenticated-router.ts:138`、`ai-diagnosis-router.ts:35`、`payment-router.ts:13` | 共通の個人/所属検証を適用。共有Bearerと任意user_idでGoogleセッションを発行できる入口を作らない。 |
| `cloudflare/worker/src/passkeys.ts:40,46` | 旧認証停止後の資格情報利用・再登録を禁止。発行中の停止競合を扱う。 |
| `cloudflare/worker/src/payment-store.ts:14,45,135`、`src/lib/api/payment-status.ts:25` | Googleによる振込の記録・読取、新規操作の個人ID、旧履歴との互換性を追加。 |
| `src/app/login/page.tsx:5`、`src/app/login/login-form.tsx:9,32` | Googleログイン、許可待ち・対象外・キャンセル・障害の案内。併存状態に応じた旧方式表示。 |
| `src/app/settings/page.tsx:5,22`、`src/features/passkey/index.tsx:12` | Google連携状態、移行案内、本人の全端末ログアウト。終了後は旧パスキー管理を除去。 |
| `src/app/[year]/[month]/page.tsx:32,65` | 旧振込チェック用の世帯識別をログイン可否から分離。既存家計の表示を維持。 |
| `src/middleware.ts:20,87` | 家計Cookieのない利用者も`/auth/migration`へ到達できるよう一次フィルタを調整し、申請専用Cookieの確認はページ側で行う。現在/apiはmatcher対象外なのでOAuthルート自身でorigin等を検証。ミドルウェアは認可の代用にしない。 |
| `src/mocks/auth-handlers.ts:9,88`、`src/mocks/db.ts:30`、`src/mocks/payment-handlers.ts:18` | user/Google主体/所属/移行状態を追加し、本番と同じ認可契約にする。 |
| `wrangler.jsonc:34,54`、`cloudflare-env.d.ts:7`、`.env.mock:18`、`docs/configuration.md` | 環境別OAuth設定・固定origin・型生成・モック設定を追加。Secret値は保存しない。 |
| `scripts/backup-schema.mjs:8,48`、`scripts/test-backup-d1.mjs:48` | 追加migrationと表を認識し、新認証データを含む非空バックアップの復元を検証。 |
| `tests/helpers/auth-sqlite.ts:9`、`tests/helpers/household-data-sqlite.ts:9` | 実migration・トランザクションを使う認証試験の土台を用意。既存テストへの影響を局所化する。 |
| `tests/integration/api/household-auth.test.ts:17`、`household-auth-http.test.ts:22` | Google/所属解除/未所属/なりすまし/旧方式停止を追加。 |
| `tests/unit/scripts/backup-schema.test.ts:10` | 新しい各段階・不足表・未知表・migration欠番を検証。 |
| `tests/e2e/helpers.ts:5`、`playwright.config.ts:21` | Googleモックでログインする共通ヘルパーへ移行し、既存ユーザーフローを継続検証。 |
| `.github/workflows/payment-d1.yml:6,47`、`.github/workflows/backup-d1.yml:28`、`.github/workflows/test.yml:14` | 認証/移行D1 suiteのpath・matrix追加。既存の並列lint/typecheck/coverage/buildを維持。 |
| `docs/database.md`、`docs/architecture.md`、`docs/features.md`、`docs/testing.md`、`docs/deployment.md`、`AGENTS.md` | 個人認証・所属・新テーブル・モックログイン・配備方針を現行仕様へ更新。 |

新規ファイル候補:

- `docs/adr/0002-google-authentication.md`: 採用方式、本人確認、認可、セッションと履歴の区別。
- `docs/google-auth-release-runbook.md`: 設定・本人確認・移行記録・公開/停止/切り戻し・アカウント復旧手順。
- `cloudflare/worker/migrations/0013_*.sql`以降: 互換追加、制約拡張、最後の旧認証停止を別段階で配布。
- `cloudflare/worker/src/users.ts`、`memberships.ts`、`google-migration.ts`、`oauth-attempts.ts`: 主体解決、認可、一度きりの処理。
- `src/lib/auth/google.ts`、`src/app/api/auth/google/start/route.ts`、`src/app/api/auth/google/callback/route.ts`: 設定・OIDC・HTTP入口。
- `src/app/auth/migration/page.tsx`、`src/features/account/`、`src/app/actions/account.ts`: 移行案内、連携状態、全端末ログアウト。
- `scripts/manage-google-migration.mjs`、`scripts/test-auth-d1.mjs`、`scripts/test-identity-migrations.mjs`: 本人確認後の運営処理と隔離D1検証。
- OAuth単体/統合、移行競合、認可、画面E2E、migration非空fixtureのテストファイル。

全Server Action/RSCについては`requireHouseholdContext`経由に加え、`getSession`・`requireAuth`の直接利用箇所も棚卸しして回帰試験する。収入・支出・繰越・月一覧・CSV・月コピー・AI・振込の既存世帯条件は維持する。

## 作業順とPR分割

概算は実装・検証で3〜5開発日。OAuth管理権限の準備、2人の本人確認・移行、本番承認の待ち時間は別。UI・認証/認可・DB・運用・検証へ分け、各段階で見積もりを更新する。

| PR | 作業と成果 | 公開条件 |
|---|---|---|
| 1: 設計・実行環境・バックアップ | ADR、OIDCのOpenNext/workerd検証、固定callback設計、バックアップ検証の拡張準備、詳細な移行手順を作る。 | アプリのログイン挙動はまだ変更しない。ライブラリの実行互換性と検証契約を確定する。 |
| 2: 互換DB追加 | users/identity/membership/試行/移行申請を追加。sessionsと振込台帳をGoogle対応可能な制約へ拡張し、旧保存値を保持する。 | 旧コード＋追加schemaが動くこと、非空復元・故障時rollbackの成功。Googleログインはまだ公開しない。 |
| 3: Googleログインと併存 | Google入口、共通認可、一度きりの移行、設定/案内、全端末失効、復旧運用、全経路テストを完成させる。 | 固定開発環境で実OAuthを確認。明示承認後に本番で旧方式と併存させ、2人を移行する。 |
| 4: 旧認証終了 | 2人の確認記録を条件に旧方式を停止。旧セッション失効、古い発行処理をDBでも拒否、旧UI/依存/Secretの整理、最終回帰と運用記録。 | 2人が独立してGoogle再ログインと既存家計利用を確認済み。Googleのみで運用でき、旧方式からの再侵入ができない。 |

後段のmigrationを先行PRに同梱しない。pending一括適用で旧方式が早期終了しないよう、段階ごとの対象SHAと適用リストを固定する。

実装タスク:

- [ ] 最新mainからブランチを作成し、関連PR・適用済みmigration・依存関係を再確認する。
- [ ] Workers上のOIDC検証を完了し、ADRと環境設定を確定する。
- [ ] バックアップの新schema対応と、非空fixtureの復元検証を用意する。
- [ ] DBの互換追加と制約拡張を、失敗注入を含むテスト先行で実装する。
- [ ] 個人セッション・所属確認・失効を共通境界に実装する。
- [ ] OAuth入口と一度きりの移行処理・運営CLIを実装する。
- [ ] ログイン/設定/移行案内、モック、全端末ログアウトと復旧運用を完成させる。
- [ ] 全家計経路・旧HTTP・振込履歴・移行競合・E2Eを検証する。
- [ ] 開発の固定callbackで実Googleログインを確認し、PR・CI・切替証跡を揃える。
- [ ] 本番操作の明示承認後、段階移行し、2人の利用確認を記録する。
- [ ] 旧認証を全入口で終了し、最終バックアップ・失効・表示・本番Versionを照合する。
- [ ] 全完了条件を満たした実施記録を残してIssue #103を完了する。

## 検証計画

| 層 | 必須ケース |
|---|---|
| OAuth/OIDC | 成功、利用者キャンセル、state/nonce/PKCE欠落・不一致、期限境界、別ブラウザ、callback再送・同時実行、偽署名、異なるissuer/aud、必要なazp不一致、鍵更新、通信障害、不正な戻り先。 |
| 主体と移行 | 同じsubの再ログイン、メール変更、同じメールで異なるsub、未承認主体、許可期限切れ・取消・消費済み・別主体、他人の照合コード、2人目による上書き、同時消費、途中失敗。 |
| 認可 | 同世帯の2user、別世帯user、未所属、解除済み所属、無効user、期限切れ、古い失効世代、所属復活後の古いCookie、URL/bodyのuser/世帯偽装、旧HTTPの直接呼出し。 |
| 家計回帰 | 一覧・集計・CSV・コピー・AI・振込の世帯境界。Googleによる振込記録/訂正/取消と、旧actor履歴の表示。担当者・符号・精算額・revision・quotaを維持。 |
| DB/復元 | 0012の非空DBから新migration適用。全既存保存値・FK・unique・CHECK・immutable trigger照合。表コピー/DROP/改名/trigger復元中の失敗でDDL・行・migration台帳が戻る。再適用、export→別隔離D1復元→実認証/家計関数を確認。 |
| UI/E2E | 未移行→片方移行→両方移行→旧方式終了を別ブラウザで確認。許可待ち・対象外・キャンセル・障害・空の月・担当者表示・全端末ログアウト。モバイル/デスクトップでスクリーンショットを確認。 |
| 旧方式終了 | 旧パスワードAction、旧パスキー認証/登録、旧Cookie、旧API、古いPreview/versionから家計に到達できない。停止とセッション発行の競合でも旧方式が復活しない。 |

テストはRED→GREEN→REFACTORで進める。対象テスト、関連スイート、全体検証の順で広げ、カバレッジ80%以上を確認する。lint・typecheck・build・既存E2Eも実行する。

ブラウザは`npm run dev:mock`でモックGoogle認証を使用する。既存のパスワード前提のヘルパーとAGENTS.mdを同時に更新する。実Google認証の手動確認は固定開発originで別に行い、CIに外部Googleの実ログインを依存させない。

一回限りの消費とDDLの検証は簡易Fake SQLだけで済ませない。実migrationを適用するSQLite、隔離したMiniflare/Wrangler D1で原子性を確認する。実Wrangler/D1検証は専用の並列Jobへ追加し、通常Unitへ混ぜない。関連pathのPRとnightlyで回し、通常PRの必須CIは10分以内を目標、15分超過時は工程時間を調べる。

## 本番切替・停止・切り戻し

1. 本番/開発Worker、稼働Version、D1 UUID、OAuthクライアントと固定callback、同じDBへ到達する旧API/Previewを照合する。#102に記録された「利用者2人の操作停止で代替」という例外を今回の承認として流用しない。
2. 各段階のDraft PR、開発検証、CI、対象SHA、停止/切り戻し手順を提示する。本番変更・マージはリポジトリの明示承認手順に従う。
3. migration前にその段階の最終SHAで本番バックアップを取得し、現行のHEAD一致・30分以内・復元検証PASSを確認する。新migration適用後も新schema対応版でバックアップを検証する。
4. 互換schemaを先行適用し、Google対応版を配備する。併存中は旧方式の既存世帯へのアクセスを維持し、Google成功だけで自動所属させない。
5. 2人のGoogle移行と独立した再ログイン、既存データの利用確認を記録する。片方でも未完了なら旧方式終了へ進まない。
6. 旧認証終了では停止状態の確定・旧セッション失効・古い処理の発行拒否を整合させる。最新Workerのフラグだけでは古いVersionに効かないため、旧方式のsessions INSERT/UPDATEを拒否するDB側の最終制約/triggerと、旧入口の到達状況を検証する。
7. 旧パスキーのアプリ内ログイン・登録・管理入口を終了し、不要な共有パスワードSecretを整理する。端末内のパスキーそのものを遠隔削除したとは扱わない。旧資格情報テーブルの物理DROPは本Issueでは行わず、利用不能を保証する。
8. 最終Version・DB・保存値・認可・表示を照合し、2人の利用を再確認する。本人確認情報・家計明細・tokenはPRや公開ログへ貼らない。

併存段階の障害では移行許可を止め、互換schemaで検証済みの対応版へ戻せる範囲を明記する。Googleの振込履歴が生成された後は、それを読めない旧版を切り戻し先にしない。旧認証終了後はGoogleと新schemaに対応する版だけへ戻し、旧セッション・共有パスワードを自動復活させない。

不正所属、認可漏れ、保存値不一致、Googleログイン不成立、停止後の旧方式成功を停止条件とする。DB復元は新規書込を失う可能性があるため、復元点と影響を示して別途承認を得る。

## 実行段階で必要な確認

- Google Cloudの設定を行えるアカウント、実際の固定開発origin、本番/開発OAuthクライアント。
- 既存2人の本人確認を行う運営担当と連絡経路、各人の家計担当者の既定値。
- Googleアカウントが使えない場合の運営連絡先。
- 2人の移行日程と旧方式を終了できる時点。本番変更の承認は、その時点の具体的な成果・証跡を揃えてから求める。

これらは実環境の登録・本人確認前に確定する。計画作成時にSecretや個人情報をチャットへ収集する必要はない。

本計画の承認は実装着手への承認であり、本番変更への承認とは分ける。Issue完了は、コードのマージだけでなく、2人の移行・旧方式終了・本番検証のすべてが完了した時点とする。

## Task 1: Google OIDCの検証境界とWorkers互換性

所有範囲: `package.json`・`package-lock.json`のoauth4webapi依存と検証スクリプト登録、`src/lib/auth/google-protocol.ts`、`tests/unit/auth/google-protocol.test.ts`、必要な`tests/helpers/google-oidc.ts`、`scripts/test-google-oidc-worker.mjs`およびその試験用fixtureのみ。親がADR・runbook・計画を担当する。

認証の公開Route、DB、家計ログイン挙動はこのタスクで変更しない。oauth4webapiの現行公式APIを読み、TDDで小さなプロトコル境界を作る。Next/OpenNextから呼べるWeb APIだけのモジュールとし、Node固有APIやモジュール評価時の環境変数参照を入れない。

提案する公開契約:

- `GoogleOAuthConfig`: clientId、clientSecret、redirectUri。空値、HTTPS以外（http://localhostだけはローカル用に許可）、資格情報付きURL、固定callback以外のpath/query/fragmentを拒否。
- `createGoogleAuthorizationRequest(config)`: Google認証URLとstate・nonce・codeVerifierを返す。毎回乱数を生成し、openid email・code・PKCE S256・nonce・state・固定redirect_uriを使用。offline access不要。
- `verifyGoogleCallback(config, callbackUrl, attempt, options?)`: 一致する固定origin/pathのcallback、state、codeを検証し、code交換、ID token必須、issuer/audience/expiry/nonce/azp、RS256署名を検証した後、`{issuer, subject, email}`だけを返す。attemptの期限・ブラウザ紐づけ・一度きり消費は後続DBタスクが担うが、値欠落を許容しない。
- テストの外部通信差し替えは内部のfetch注入だけで行い、公開HTTP入力から検証を無効化できるオプションを作らない。エラーは安全な種別だけで返し、providerの応答body/code/token/Secretを露出しない。

公式: https://github.com/panva/oauth4webapi 、https://developers.google.com/identity/openid-connect/reference 。Googleの現行Discovery（https://accounts.google.com/.well-known/openid-configuration）はS256、RS256、issuer=https://accounts.google.comを返す。ID token署名はprocessAuthorizationCodeResponseだけで完了扱いにせずvalidateApplicationLevelSignatureを明示実行する。

現代のGoogleクライアント用に信頼するissuerはcanonicalのhttps://accounts.google.comへ固定する。legacy issuerの受理が公式ライブラリで安全に実装できなければ、曖昧なtoken改変をせず厳密拒否し、報告する。

テストはGoogle外部通信だけをfixture fetchへ差し替え、実WebCryptoで署名したJWTと実oauth4webapiを使う。正常系、state/nonce/PKCE引数・固定callback、別aud/iss、期限切れ、署名不正、code欠落・キャンセル、非JSON/通信障害、Secret非露出を検証。APIの実際の挙動を理解してからfixtureを組む。単純な定数・ソース文字列一致だけの試験は不要。

Miniflare/workerdで同じproductionモジュールをbundleし、正常署名と不正署名の結果まで検証する独立scriptを作る。通常Unitに実workerdを混ぜない。npm run typecheckと対象テスト、独立scriptを実行し、結果を報告する。全体テスト/buildは親が統合時に行う。Secretなしの検証結果を実Googleアカウント確認済みとは表現しない。

所有範囲に新規`.github/workflows/google-auth.yml`も含める。pull_request/push(main)で認証モジュール・対応テスト/fixture・独立script・package/lock・workflow自身の変更時にNode22/npm ci/独立workerd試験を実行する。contents:read、timeout10分。既存Unit/Integrationのmatrixは維持する。
