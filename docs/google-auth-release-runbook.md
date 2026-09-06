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
| 固定開発 | 開発Workerの実際の固定workers.dev originに`/api/auth/google/callback`を付けたURL。候補は`https://score-splitter-dev.bluespec.workers.dev/api/auth/google/callback`。実URL確認後に登録する。 |
| ローカル実OAuth | `http://localhost:3000/api/auth/google/callback` |

同意画面・公開状態・対象ユーザーを確認する。Google側の設定だけで既存家計を保護せず、アプリの主体固定の許可と所属検証を必須にする。

client IDとcallback用originは非秘密の環境設定、client secretはWorkers Secretで扱う。値をGit、PR、ビルドログ、チャットへ貼らない。ユーザーが安全な方法で用意した値を設定するときは、必ず`--env dev`と対象Workerを照合する。

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

実Google確認とモックE2Eの結果は分けて記録する。開発で成功した後に本番対象SHA・CI・バックアップ・切り戻し条件を提示する。本番では新規のテスト世帯や架空の振込を作らない。

## 本人確認と本番移行

運営は既存の本人と対面または従来の信頼できる連絡経路で申請コードを照合する。申請から検証済みGoogle主体を取得し、その主体と既存世帯・既定担当者に固定した許可を付ける。メール入力や旧session.personだけでは承認しない。

利用者は同じGoogleで再ログインして移行を確定する。2人それぞれの独立した再ログイン、既存明細の担当者、精算額、振込履歴の確認結果を記録する。本人確認の詳細やGoogle主体の値は公開文書へ載せず、運営の管理下で扱う。

## 第4段階: 旧認証終了

両名の確認と本番切替の承認が揃ってから行う。旧方式停止・旧セッション失効・DBでの旧発行拒否を整合させ、旧WorkerやPreviewからの試行も確認する。

旧パスワード・パスキーのログインだけでなく、登録・管理・直接Server Action呼出しも終了する。共有パスワードSecretは切り戻し条件を確認した後に整理する。端末内のパスキーを遠隔削除したとは扱わない。

旧世帯の識別情報は保存する。旧資格情報表の物理DROPは今回行わず、旧方式で利用できないことを保証する。過去の振込actorをGoogleへ書き換えない。

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
