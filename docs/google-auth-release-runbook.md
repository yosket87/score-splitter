# Googleログインの段階リリース手順

対象はIssue #103。実装の順次実行と開発環境の使用は承認済み。本番のマージ・migration・配備・旧認証終了は、その時点の成果と証跡を提示して明示承認を得る。

## 開始時の記録（2026-09-06）

- 起点SHA: `953ee5c27cfbbfb114fef3b0935ceea7102e4838`。
- 本番Worker: `score-splitter`、100%稼働Version: `032f523f-ad7c-4cca-8f60-dcd1bc20038a`。
- 当該本番VersionのDB: `7f8d3531-a833-4474-84d5-cee3ac98ee96`。API公開先やSecretの変更は実施していない。
- 開発Worker: `score-splitter-dev`、開始時100%稼働Version: `802f6823-5a2e-4771-9d86-4e8baac47ac3`。
- 開発用設定のDB: `51457bd5-8e0e-4645-ad34-86634285af2c`。配備時は設定ファイルだけでなくVersionのbindingも照合する。
- 開発Secretの名前: `APP_PASSWORD_HASH_BASE64`、`OPENAI_API_KEY`。Google用Secretはまだ設定されていない。
- ベースライン: Unit/Integration 110ファイル・1,311テスト成功。

これらは開始時の記録であり、切替時の現況の代用にはしない。

## OAuth設定

Google Cloudの対象プロジェクトを特定し、Webアプリケーション用のOAuthクライアントを本番・開発で分ける。関係のない会社プロジェクトへ作成しない。

| 用途 | callback |
|---|---|
| 本番 | `https://app.yamawake.app/api/auth/google/callback` |
| 固定開発 | `https://score-splitter-dev.bluespec.workers.dev/api/auth/google/callback`（固定Workerの応答を確認済み） |
| ローカル実OAuth | `http://localhost:3000/api/auth/google/callback` |

同意画面・公開状態・対象ユーザーを確認する。Google側の設定だけで既存家計を保護せず、アプリの主体固定の許可と所属検証を必須にする。

client IDとcallback用originは非秘密の環境設定、client secretはWorkers Secretで扱う。値をGit、PR、ビルドログ、チャットへ貼らない。ユーザーが安全な方法で用意した値を設定するときは、必ず`--env dev`と対象Workerを照合する。

| 設定名 | 用途・保管方法 |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | 対象環境のGoogle OAuth WebクライアントID。環境ごとに分離する |
| `GOOGLE_OAUTH_ORIGIN` | 登録済みの固定origin。callbackのpathは`/api/auth/google/callback`に固定する |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Workers Secret。実ローカルOAuthではGit管理外の設定で扱う |

3項目が揃わない環境ではGoogleログインを有効にしない。設定不足を開発モックへの切り替え条件にせず、互換期間の旧ログインを維持する。

動的PR Previewでは実OAuthを確認しない。家計の画面・異常系はローカルのモックで検証し、同じSHAを固定開発Workerへ配備して実Googleを確認する。別ホストへcode/tokenを転送する仕組みは追加しない。

## 第1段階: プロトコルと復元方針

OIDCライブラリを使う純粋な検証境界を追加する。実WebCryptoで署名したテスト応答を使い、正常署名と異常系をNode/Vitestとworkerdで確認する。OpenNextのビルドも確認する。

この段階で認証Routeやschemaは公開しない。Google用Secretが未準備でも検証を進められるが、実Googleアカウントでの成功とは記録しない。新schemaの実バックアップ検証は第2段階のmigrationと一緒に完成させる。

## 第2段階: 互換DB追加

新migration・backup-schema登録・非空fixture・失敗注入・復元試験を同じPRに揃える。古いバックアップ実装を、新migrationの適用後に使用しない。

開発への適用前に、適用リストとDB UUIDを照合し、必要な退避を取る。互換migrationは旧方式を停止しない。実利用者に依存する最終停止は後段の運営操作に分離する。sessionsと振込台帳の制約変更では件数だけでなく全保存値、FK、索引、triggerを比較する。

## 第3段階: 個人認証と併存

固定開発環境で以下を確認する。

- Googleログイン、本人確認前の申請画面、対象主体への一度きりの許可、再ログイン後の同じ世帯の表示。
- 未許可のGoogle主体・別主体の許可・失効した所属・偽造callbackを拒否。
- 家計の一覧、CSV、コピー、AI、Googleでの振込記録と旧履歴表示。
- 全端末ログアウト後は本人だけが再ログインを要求され、パートナーは継続利用できる。
- キャンセル、タイムアウト、通信障害、空の月、スマートフォン表示。

固定開発D1の既存世帯へ架空Google主体を登録して移行枠を消費しない。停止・復旧の合成fixture試験は隔離D1で行い、実在世帯の移行は確認済みGoogle主体を使う。

実Google確認とモックE2Eの結果は分けて記録する。開発で成功した後に本番対象SHA・CI・バックアップ・切り戻し条件を提示する。本番では新規のテスト世帯や架空の振込を作らない。

## 本人確認と本番移行

運営は既存の本人と対面または従来の信頼できる連絡経路で申請コードを照合する。申請から検証済みGoogle主体を取得し、その主体と既存世帯・既定担当者に固定した許可を付ける。メール入力や旧session.personだけでは承認しない。

利用者は同じGoogleで再ログインして移行を確定する。2人それぞれの独立した再ログイン、既存明細の担当者、精算額、振込履歴の確認結果を記録する。本人確認の詳細やGoogle主体の値は公開文書へ載せず、運営の管理下で扱う。

### 運営CLIによる申請承認

実運営のremote承認は未実施。以下は入力契約であり、モックやローカルD1の成功をremote承認済みの証拠としない。

まず、利用者から受け取った`code`と、運営が確認した既存の`householdId`を権限600の非公開JSONへ保存する。次の読み取り操作で、コードのハッシュに一致する申請と、その世帯の既存個人・所属・Google連携情報を確認する。

```bash
npm run auth:google:admin -- inspect --env dev --confirm-database 51457bd5-8e0e-4645-ad34-86634285af2c --input-file /private/path/lookup.json --output-file /private/path/inspection.json
```

出力は権限600の新規ファイルだけに保存し、既存ファイルは上書きしない。`requests`の`requestId`を承認入力へ使う。復旧時は`existingPeople`から本人確認済みの個人を選び、`userId`、`identityId`、`sessionEpoch`を、それぞれ`targetUserId`、`expectedOldIdentityId`、`expectedEpoch`へ指定する。メールの一致だけで候補を自動選択しない。失効状態も確認し、不明な場合は承認しない。これらの結果を公開Gitへ保存しない。

承認入力は公開Git外の所有者だけが読めるJSONファイル（権限600）で用意する。移行承認は`requestId`、`code`、`approvedBy`、`confirmationRef`、`householdId`、`legacySlot`、`defaultPerson`を指定する。`legacySlot`は既存2名の`existing-member-1`または`existing-member-2`、`defaultPerson`は本人確認済みの`husband`または`wife`。申請の検証済み主体はDBから取得し、メールだけを根拠にしない。

```bash
npm run auth:google:admin -- approve-migration --env dev --confirm-database 51457bd5-8e0e-4645-ad34-86634285af2c --input-file /private/path/approval.json
```

復旧は`approve-recovery`を指定し、入力は`requestId`、`code`、`approvedBy`、`confirmationRef`、`targetUserId`、`expectedOldIdentityId`、`expectedEpoch`とする。既存個人と現在の失効世代を照合し、承認後に新しいGoogle主体でログインする。復旧確定だけでは家計sessionを発行せず、さらにGoogleログインして利用を再開する。

CLIは設定上のbindingとWrangler標準認証で取得した実DBの名前・UUIDを照合する。SQLやコードをコマンド引数へ直接渡さない。本番向けの実行は別途切替承認後に行い、この開発コマンドを対象確認なしに流用しない。

## 第4段階: 旧認証終了

両名の確認と本番切替の承認が揃ってから行う。旧方式停止・旧セッション失効・DBでの旧発行拒否を整合させ、旧WorkerやPreviewからの試行も確認する。

旧パスワード・パスキーのログインだけでなく、登録・管理・直接Server Action呼出しも終了する。共有パスワードSecretは切り戻し条件を確認した後に整理する。端末内のパスキーを遠隔削除したとは扱わない。

旧世帯の識別情報は保存する。旧資格情報表の物理DROPは今回行わず、旧方式で利用できないことを保証する。過去の振込actorをGoogleへ書き換えない。

### 終了前確認と明示実行

実行前に2人それぞれが独立してGoogleへ再ログインし、既存明細・精算額・振込履歴を確認する。`inspect`の結果だけではこの確認を代用できない。結果を運営管理で保存し、次のJSONを権限600の非公開ファイルに用意する。

| 入力 | 内容 |
|---|---|
| `householdId` | 終了対象の既存世帯 |
| `confirmedBy` | 2人分の確認記録を照合した運営担当 |
| `members` | 次の項目を含む2人分の配列 |
| 各人の`legacySlot` / `userId` | 消費済みの既存利用者枠と個人。2人を別々に指定 |
| 各人の`identityId` / `membershipId` / `sessionEpoch` | `inspect`で取得したGoogle連携・所属ID・失効世代。所属の唯一性はreview/finalizeで検証する |
| 各人の`reloginRef` / `dataCheckRef` | その人の再ログイン記録と既存データ確認記録への参照。2人で使い回さない |

次のコマンド例は開発環境用の操作形式であり、現在の未移行世帯へ実行するものではない。開発の合成試験は隔離D1で完結させる。

```bash
npm run auth:google:admin -- review-finalize --env dev --confirm-database 51457bd5-8e0e-4645-ad34-86634285af2c --input-file /private/path/confirmation.json --output-file /private/path/review.json
```

reviewは状態を読み取り、確認済み環境・DB UUIDを付けた新規の非公開ファイルを作る。この操作では停止しない。本人の実操作をDBだけで証明できるとは扱わず、運営が参照先の内容を確認する。

対象と確認結果を照合し、実行が承認された段階で、同じ環境・DBとreviewファイルを指定する。

```bash
npm run auth:google:admin -- finalize --env dev --confirm-database 51457bd5-8e0e-4645-ad34-86634285af2c --input-file /private/path/review.json
```

実行時にも2人の有効状態・Google連携・唯一の所属・失効世代・消費済み枠を同じUPDATE条件で確認する。条件が変わって対象が0件なら失敗とし、旧session削除と停止日時設定を原子的に行う。停止済みの世帯は再停止・巻戻しせず、既存の結果を確認する。成功・既停止の結果には正規化したISO形式の停止日時を表示するので、実行記録へ保存する。本番への実行は、本番の確認資料と明示承認を別途揃える。

## 停止・復旧

認可漏れ、不正所属、保存値不一致、旧方式終了後の旧ログイン成功、両名の利用不能を停止条件とする。併存段階はそのschemaとGoogle履歴を扱える版へ戻し、最終停止後はGoogle対応版のみを切り戻し候補にする。

DB復元は復元点以降の書込に影響するため、復元時点・失われる可能性のある変更を確認し、別途承認を得る。旧パスワードと旧sessionを自動復活させない。

Googleアカウントを利用できない場合はGoogle側の復旧を案内する。運営の再紐づけが必要な場合は、本人確認、新主体での認証、旧主体停止、全端末失効、一度きりの再紐づけを監査付きで実施する。運営連絡先は公開前に確定する。

## 実施記録

各段階について、PR、SHA、CI、実行した試験、Worker Version、DB UUID、適用migration、バックアップ/復元結果、実Google確認、残事項を追記する。開始時の本番Versionを作業終了時にも読み取り比較する。

### 第1段階のローカル検証

- `6ebcf0f`: OIDC専用58テスト、対象モジュールのカバレッジ100%。
- Node互換フラグを使わないworkerdで検証境界の動作を確認。
- `opennextjs-cloudflare build --env dev`成功。
- `6ebcf0f`: 全体1,369テスト成功、全体statement coverage 92.39%。lintはエラー0件、既存パスキーボタンの警告1件。
- `341bab0`: 通信の合計10秒上限と4テストを追加。OIDC専用62テスト・typecheck・対象lint・workerd再検証成功。仕様・コードレビューで重大指摘なし。
- 実Googleアカウントと固定開発Workerでのログインは未検証。

- 第1段階Draft PR: [#123](https://github.com/yosket87/score-splitter/pull/123)、対象SHA `bdb7803`。全12チェック成功、E2E job 5分49秒。マージは実施していない。
- 第2段階開始前の開発D1（`51457bd5-8e0e-4645-ad34-86634285af2c`）をexportし、0012のSQLite復元・整合性・外部キー・期待DDL一致を確認した。移行適用前には再取得する。

### 第2段階の互換DB検証

- `2323052`: 全体1,417テスト成功、statement coverage 92.41%。
- `9661739`: 通常バックアップ作成と切替前再検証にOAuth採番の高水位・失効下限の検査を追加。関連206テスト、隔離D1の移行・復元、typecheck、対象lint成功。
- migration 0013の最終SHA256: `21b6046f36320ad3e405a918d9e3fcd0f2970143c74cd7da11bb5cca33c9dc31`。`12e7c1b`でD1 remoteの解析に合わせて2箇所のCASEを括弧化。関連249テスト・隔離D1・独立レビュー成功。開発0012 exportへの再リハーサルで、既存16表の全保存値・FK・整合性を維持することを確認。
- 開発への適用前に2026-09-06 10:02 UTCのexportを再取得。SQLite復元・0012期待DDL・FK・整合性を確認済み。export SHA256: `0fcbfacbe08652be6336408c97f5a0c2430e62fedb995287f36b8ed5fec870e3`。

- 第2段階Draft PR: [#124](https://github.com/yosket87/score-splitter/pull/124)、baseは第1段階ブランチ。
- 2026-09-06 10:15 UTC: 開発D1 `51457bd5-8e0e-4645-ad34-86634285af2c`に0013を適用（159 commands、43.75ms）。初回のSQL解析エラー後はexport全体が適用前と一致し、上記書式修正後に成功した。
- 適用後exportのSQLite復元・0013期待DDL・FK・整合性、旧16表の全保存値一致を確認。追加5表は空、旧方式停止日時は未設定。適用後export SHA256: `5adf9f22df26baea52c3b2d3d81027068dabe330b7f1f20adf931ecb6fc00983`。
- 固定開発Workerで旧パスワードログインと認証後の家計再表示（HTTP 200）に成功。資格情報は出力せず、本番への変更は行っていない。
- `3c4d165`: CIのバックアップ試験8件が5秒の個別上限を超えたため、migration単位のtransactionと試験用の不変snapshotコピーで重複生成・確定回数を削減。主要試験15.589→9.159秒、SQLite試験3.740→1.990秒。timeoutは変更せず、関連208テスト・backup専用coverage 90.6%・identity/backupの隔離D1試験に成功。
- 第2段階最終SHA `9dc93f3`: 全13チェック成功。E2E jobは5分51秒、テスト工程4分59秒（2026-09-06 10:31 UTC完了）。

## 本番移行時の証跡欄

実施時に次の項目を記録する。本人確認の詳細、Google主体、照合コード、資格情報をGitやPRへ貼らず、運営が管理する記録への参照と確認結果だけを残す。未実施の欄を成功で埋めない。

| 確認項目 | 記録する内容 |
|---|---|
| 配備対象 | 承認済みSHA、CI結果、Worker Version、DB UUID |
| バックアップ | 当該SHAによる作成・切替直前の再検証結果と保管参照 |
| 利用者1の本人確認 | 信頼できる連絡経路で申請を照合した記録への参照 |
| 利用者2の本人確認 | 同上。利用者1の確認で代用しない |
| 利用者1の移行確認 | 独立したGoogle再ログインと既存の明細・精算額・振込履歴を確認した記録への参照 |
| 利用者2の移行確認 | 同上。初回本人確認やDB上の所属の存在で代用しない |
| 旧方式終了 | 対象世帯・2人の対応の再照合、明示承認、停止日時、旧session失効とGoogle継続の確認 |
| 復旧経路 | Google側の復旧案内、運営の本人確認窓口と再紐づけ手順を確認した結果 |
| 切り戻し候補 | Google対応schemaと履歴を扱えるVersion、復元を伴う場合の別途承認 |

実行前の確認画面・出力だけでは完了としない。実行結果を照合し、条件が変わって実行対象が0件になった場合は、対象を再確認する。

## 第3段階の認証基盤検証

- `8b67376`: 全体117ファイル・1,481テスト、独立D1認証試験、typecheck、lint成功。対象ドメインの行カバレッジ100%、分岐90.90%。Workers向けOpenNext開発設定ビルド成功。
- `1af6ceb`: 事前失効済み旧主体を保持する復旧と、許可の最終更新が0件の場合の原子rollbackを修正。関連55テストと実D1故障注入試験成功。
- `20596b0`: 加入・復旧の許可期限をDB実行時刻でも検査。実行待ち中の期限到達を待機に依存しないテストで再現し、関連57テスト・独立D1・typecheck・lint成功。
- 公開Route・画面・運営CLIとの接続および実Google認証は、後続の検証記録で区別する。


### 第3段階の画面・運営接続検証

- Google入口、確認待ち、設定、全端末ログアウト、復旧、運営承認CLIを接続。実Google用のclient/secretは未設定。
- カバレッジ測定124ファイル・1,522テスト、最終全体1,529テスト、全78 E2E（2.8分）、typecheck、lint、OpenNext build成功。CLI修正後の対象36テストと隔離D1も成功。
- 有効なダミーGoogle設定を与えた実Workers成果物で、通常login 200、正規Googleへの303、Preview拒否と試行0件、全mock入口404、家計session未発行、外部通信0件を確認した。
- Wranglerのremoteファイル取り込みではSELECT行が得られないため、非公開入力をプロセス内部で通常queryへ渡す方式に修正。実Wranglerをloopbackの合成APIへ接続し、検索結果の保持を検証。実運営のremote承認は未実施。
- CUAで既存2月の明細、空9月、375px幅の長いemailと照合コード、コードコピー、承認後再ログイン、設定、確認dialog、全端末ログアウト、旧passwordログインを確認。目視用の一時HTMLは削除済み。

- `40211db`のCLI転送経路で、実開発D1への読み取り専用SELECT成功を確認。Google個人0件・旧方式停止世帯0件を維持。実承認や書き込みは行っていない。

- `7a93b13`: 正規originのOAuth開始時に期限切れ試行の秘密を清掃し、ログイン結果のqueryを既知3値へ限定。関連52テスト・typecheck・lint・OpenNext build・更新成果物の封鎖試験成功。

- 第3段階Draft PR: [#125](https://github.com/yosket87/score-splitter/pull/125)、baseは第2段階ブランチ。`7a93b13`の修正再レビューで未解消指摘0件。
- 2026-09-06 12:15 UTC: 第3段階（配備時HEAD `0b7dd0b`）を固定開発Workerへ配備。Version `bee98a84-d1bb-4d62-a02a-665167cb0b5b`、DB binding `51457bd5-8e0e-4645-ad34-86634285af2c`を実Versionから照合。Google client IDは空、Secret未設定、旧認証は継続。
- 配備後、開発の旧passwordログイン・認証後の家計再表示200・ログアウト成功。実Google認証、実運営承認、旧方式の最終停止、本番変更は未実施。

- `7352486`: 第3段階CIで、0011/0012の歴史DBへ0013必須の現APIを接続していた試験不整合を修正。元DBの故障注入・rollback・再適用・0012の16表復元検証は維持し、独立cloneだけを正規0013へ進めて現APIを検証。clone初期schema・全値一致、更新後の旧全列全値保持、元state不変、対象D1・typecheck・lint成功。アプリのschema fallbackは追加していない。

- 第3段階最終HEAD `8a09050`: 全15 CI成功。世帯migration Jobは2分16秒（試験1分48秒）、E2E Jobは5分59秒（試験5分7秒）。本番Version `032f523f-ad7c-4cca-8f60-dcd1bc20038a` が100%のまま維持されていることも読み取り確認した。


## 第4段階の実装検証

- `ef54eca`: 2人の確認記録を入力とするreview/finalize、旧認証の共通停止判定、停止後UIを実装。配備だけで停止しない。
- 全体127ファイル・1,553テスト、カバレッジ91.08%、全80 E2E（3.1分）成功。typecheck、lint、OpenNext build、有効ダミー設定による実Workers成果物のモック遮断・Preview拒否も成功。
- 隔離D1で確認不足・重複・実行直前の利用者停止/所属追加/Google連携失効・UPDATE0件を拒否。正常時の旧session削除、2人の停止後Google再ログイン、旧passkey/challenge/管理入口拒否、履歴保持を確認。歴史migrationのclone検証も成功。
- CUAで375px幅のGoogleのみログイン、既存2月の明細・精算15,500円、空9月、旧パスキー管理を終了した設定、復旧案内、全端末ログアウトを確認。ローカル合成fixtureだけを使用し、一時HTMLは削除済み。
- 実Googleクライアント設定、2人の実本人確認・独立再ログイン・既存データ確認、実世帯のfinalize、本番変更は未実施。

- `ef54eca`の独立レビューは未解消指摘0件。2026-09-06 13:01 UTC、最終成果物を固定開発Workerへ配備。Version `61a782ee-5db9-467f-8b77-e6876119b109` が100%、実DB bindingは開発UUIDと一致。
- 最終配備後の旧passwordログイン・家計再表示200・ログアウト成功。開発Google個人0件、停止済み世帯0件、Google client/secret未設定を読み取り確認。実世帯の停止は行っていない。本番Version `032f523f-ad7c-4cca-8f60-dcd1bc20038a` は100%のまま不変。
