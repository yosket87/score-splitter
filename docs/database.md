# データベース設計

## 概要

Cloudflare D1（SQLite）を使用したデータベース設計です。本番・開発とも、Next.js/OpenNextのWorkerが `DB` bindingでD1へ直接アクセスします。D1ドメイン関数は `cloudflare/worker/src/` と共有し、同ディレクトリの `index.ts`（HTTP入口）経由のアクセスは `USE_MOCKS=true` のモックテストまたは切り戻し用に限定します。

## 世帯列の互換移行（0009/0010）

0009で `households`（id主キー、nullable一意のlegacy_auth_key、created_at）と、明細3表・認証3表・AI3表・振込4表の `household_id TEXT REFERENCES households(id)` を追加する。互換期間はNULLを許容し、DEFAULTは設けない。login_attemptsとwaitlist_entriesは認証前/公開処理のため対象外。以下の既存列定義にこの共通列が加わる。

0010は既存世帯の唯一性・識別子と既知所属/認証状態を検査してNULLを補完する。authentication challengeだけはNULLを維持する。既存ID・token・公開鍵・counter・JSON文字列・AI利用回数・revisionを保持し、振込の更新禁止トリガーを同じmigration内で復元する。旧版が新たに書くNULLは後続の切替停止中に追補する。この段階ではキーやアプリがまだ世帯分離を完了していない。[段階リリース手順](household-release-runbook.md)

## 世帯キーへの切替（0011）

0011は全旧経路の停止後、旧版が書いたNULLを最後に補完し、AI3表・振込4表を世帯キーとNOT NULL/FKへ再構築する。コピー時に全保持列を比較し、JSON・ID・利用回数・revisionは変更しない。以下は0011まで実装されたschemaの説明であり、本番適用済みを意味しない。

| 対象 | 世帯を含む制約 |
|---|---|
| ai_diagnoses | UNIQUE(household_id, month) |
| ai_execution_guard / ai_diagnosis_source_revision | household_idが主キー。旧id=1は非キー列として保持 |
| month_payment_revisions | PRIMARY KEY(household_id, month) |
| payment_operations | PRIMARY KEY(household_id, id) |
| payment_records / payment_voids | 所属付きoperation参照、取消対象への所属付き複合FK。履歴UPDATE/DELETE禁止 |
| carryovers | UNIQUE(household_id, month, label, amount, person) |

AI3表・振込4表のhousehold_idはNOT NULL。明細3表と認証3表は0011では暫定トリガーで所属欠落・変更を拒否し、認証前challengeだけNULLを許す。これら6表の最終制約は0012で強化する。

## テーブル構造

### incomes（収入テーブル）

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| month | TEXT | 対象月（YYYYMM形式） |
| label | TEXT | 項目名 |
| amount | INTEGER | 金額（正の値） |
| person | TEXT | 担当者（'husband' / 'wife'） |
| created_at | TEXT | 作成日時（ISO文字列） |
| updated_at | TEXT | 更新日時（ISO文字列） |

### expenses（支出テーブル）

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| month | TEXT | 対象月（YYYYMM形式） |
| label | TEXT | 項目名 |
| amount | INTEGER | 金額（負の値） |
| person | TEXT | 担当者（'husband' / 'wife'） |
| is_carryover | INTEGER | 繰越扱いフラグ（0/1） |
| ai_category | TEXT NULL | 固定14候補のAI内部カテゴリ |
| ai_category_source | TEXT NULL | 分類元。MVPでは `ai` のみ |
| ai_categorized_at | TEXT NULL | 分類日時（ISO文字列） |
| created_at | TEXT | 作成日時（ISO文字列） |
| updated_at | TEXT | 更新日時（ISO文字列） |

AIカテゴリ3列は診断専用の内部情報であり、通常のExpense API・型・画面へは露出しません。支出ラベルを変更した場合だけ3列を同一UPDATE内でNULLへ戻します。金額、担当者、繰越フラグだけの変更では分類を保持します。

### ai_diagnoses（AI家計診断テーブル）

世帯＋月ごとの最新診断と実行leaseを保持します。履歴は保存せず、同じ世帯の月単位でupsertします。

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| month | TEXT | 診断対象月（YYYYMM）。household_idと組み合わせて一意 |
| result_json | TEXT NULL | 検証済み4ブロック診断。leaseのみの行はNULL |
| input_hash | TEXT NULL | 対象4か月の診断入力指紋 |
| analysis_version | TEXT NULL | 集計・プロンプト契約のバージョン |
| run_token | TEXT NULL | 実行所有者を示す一時トークン |
| run_expires_at | TEXT NULL | lease有効期限 |
| created_at | TEXT | 作成日時（ISO文字列） |
| updated_at | TEXT | 最終更新日時（ISO文字列） |

診断開始時はD1の条件付きUPDATEで3分間のleaseを取得します。保存・解放は取得時と同じ`run_token`に限定し、期限切れ・別runの書き込みを409で拒否します。分類保存も対象月と世帯全体guardのtoken・期限を同一SQL内で確認し、`id + expectedLabel + ai_category IS NULL`のcompare-and-setが全件成立する場合だけ更新します。`input_hash`または`analysis_version`が現在値と異なる場合も保存結果は削除せず、期限切れとして明示的な再診断を促します。

診断context APIは担当者を除外し、収入は月別合計に必要な金額だけを扱います。AI内部カテゴリ、担当者、収入ラベル、認証情報、レコードIDは通常APIまたはOpenAIの診断文payloadへ露出しません。

### ai_execution_guard（AI診断の世帯全体guard）

世帯ごとに1行を持ち、異なる月を含むAI診断の同時実行と利用回数を管理します。

| カラム | 型 | 説明 |
|-------|---|------|
| household_id | TEXT | 世帯主キー・householdsへの外部キー |
| id | INTEGER | 旧値を保持する互換列。常に1、主キーではない |
| run_token | TEXT NULL | 現在の世帯全体実行所有者 |
| run_expires_at | TEXT NULL | 世帯全体leaseの有効期限 |
| last_started_at | TEXT NULL | 直近の診断開始日時 |
| usage_date | TEXT | UTC基準の利用日（YYYY-MM-DD） |
| daily_count | INTEGER | 利用日の開始回数 |
| updated_at | TEXT | 最終更新日時（ISO文字列） |

月leaseと世帯全体guardはD1 `batch()`のtransactionでまとめて条件付き取得します。同時実行は1件、cooldownは5秒、UTC日次上限は20回です。busyは409、cooldownまたは日次上限は`Retry-After`付き429を返します。診断保存または所有tokenによるlease解放で`ai_diagnoses.run_token`をNULLへ更新すると、triggerが同じ世帯・tokenのguardだけを解放します。

### ai_diagnosis_source_revision（診断入力revision）

世帯ごとの主キー`household_id`と単調増加revision（旧`id = 1`は互換列として保持）で、診断生成中に家計データが更新されていないことを最終保存時に検証します。context取得では収入・支出・繰越とrevisionを同じD1 `batch()` snapshotで読み、保存UPDATEの同一statementに期待revisionを含めます。不一致は専用409となり、古い結果はfreshとして保存しません。

revisionは収入の`month/amount`、支出の`month/label/amount/is_carryover`、繰越の`month/amount/is_cleared`の更新と、3テーブルのinsert/deleteで増加します。担当者、収入・繰越の表示label、AI内部カテゴリだけの更新では増加しません。

### carryovers（繰越テーブル）

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| month | TEXT | 対象月（YYYYMM形式） |
| label | TEXT | 項目名 |
| amount | INTEGER | 金額（負の値） |
| person | TEXT | 担当者（'husband' / 'wife'） |
| is_cleared | INTEGER | 清算済みフラグ（0/1） |
| created_at | TEXT | 作成日時（ISO文字列） |
| updated_at | TEXT | 更新日時（ISO文字列） |

### waitlist_entries（ウェイトリストテーブル）

LP（`/lp`）経由の需要検証用ウェイトリスト登録を保存します。

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| email | TEXT | メールアドレス（UNIQUE） |
| price_intent | TEXT | 価格意向（'free_only' / 'paid_ok'） |
| simulator_used | INTEGER | シミュレーター利用フラグ（0/1、デフォルト0） |
| created_at | TEXT | 作成日時（ISO文字列） |

### sessions（セッションテーブル）

Cookieにはトークンのみを保存し、期限・認証方式・personはD1に保存します。

| カラム | 型 | 説明 |
|-------|---|------|
| token | TEXT | 主キー（64文字のセッショントークン） |
| person | TEXT | 担当者（'husband' / 'wife'、パスワード認証時はNULL） |
| auth_method | TEXT | 認証方式（'password' / 'passkey'） |
| expires_at | TEXT | 有効期限（ISO文字列） |
| created_at | TEXT | 作成日時（ISO文字列） |

### passkey_credentials（パスキークレデンシャルテーブル）

WebAuthnの公開鍵はD1操作で扱いやすいように`public_key_base64`へBase64文字列として保存します。

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（クレデンシャルID） |
| person | TEXT | 担当者（'husband' / 'wife'） |
| public_key_base64 | TEXT | Base64形式の公開鍵 |
| counter | INTEGER | 署名カウンター（デフォルト0） |
| device_name | TEXT | 任意のデバイス名（NULL可） |
| transports | TEXT | transport一覧のJSON文字列（デフォルト'[]'） |
| created_at | TEXT | 作成日時（ISO文字列） |

### webauthn_challenges（WebAuthnチャレンジテーブル）

パスキー登録・認証用の短命チャレンジを保存します。期限切れデータはServer ActionからD1操作を通じて削除します。

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| challenge | TEXT | WebAuthnチャレンジ |
| type | TEXT | 種別（'registration' / 'authentication'） |
| person | TEXT | 担当者（'husband' / 'wife'、認証時はNULL可） |
| expires_at | TEXT | 有効期限（ISO文字列） |
| created_at | TEXT | 作成日時（ISO文字列） |

### login_attempts（ログイン試行テーブル）

パスワード認証のレート制限に使用する試行回数と時間窓を保存します。

| カラム | 型 | 説明 |
|-------|---|------|
| attempt_key | TEXT | 主キー（クライアント識別キー） |
| count | INTEGER | 時間窓内の失敗回数（0以上） |
| window_start | TEXT | 時間窓の開始日時（ISO文字列） |
| updated_at | TEXT | 更新日時（ISO文字列） |

## 設計上の注意点

入力時は支出・繰越も正の値で入力し、Server Actionsで負の値に変換して保存します。

D1にはRLSがないため、以下で保護します。

- D1 bindingへのアクセスをWorkerのサーバー側処理に限定する
- ブラウザにD1資格情報や旧Worker APIトークンを出さない
- セッションCookie、入力検証、ログイン試行制限
- 全家計SQLへDB session由来の世帯contextを必須で渡す
- D1の世帯付き一意制約・複合外部キー・所属変更禁止・CHECK制約

## マイグレーション

D1マイグレーションは `cloudflare/worker/migrations/` に配置しています。

## 環境分離とバックアップ

- 本番Worker `score-splitter` は本番D1 `score-splitter` に接続する
- 開発Worker `score-splitter-dev` は開発D1 `score-splitter-db-dev` に接続する
- rootアプリのPR Previewは共有の開発D1を使用し、本番D1のデータを開発環境へコピーしない。旧APIの自動Previewには本番D1接続が残るため、世帯対応版をpushする前に停止/隔離を確認する
- 本番D1へbindingを変更・デプロイする前に、必ず `npm run backup:d1:production -- --confirm-production-d1 <本番D1 UUID>` を実行する
- バックアップscriptはTime Travel bookmark、全量SQL、SHA-256、SQLite復元の整合性・外部キー・適用済みmigrationに対応する全業務表の集合/件数照合を検証し、`PASS` manifestを作成する。PASSがない状態で本番PRをReadyに変更・merge・本番デプロイしてはならない
- バックアップはGit管理外の `~/Documents/Backups/score-splitter/d1/` に保存する。Time Travelのrestoreはデータ破損時にユーザーが明示承認した場合だけ実行する

### 振込記録（0008で追加、0011で世帯キーへ切替）

| テーブル | 用途 |
|---|---|
| month_payment_revisions | 世帯＋monthごとの単調増加revision。未作成の月は0 |
| payment_operations | 世帯内で一意なUUIDの冪等キー、操作種別、確認revision、入力・結果JSON、記録者とUTC日時 |
| payment_records | 符号付き整数支払額、支払日、記録時snapshotと計算・丸めバージョン |
| payment_voids | 元支払への一意な取消、操作ID、理由とUTC日時 |

支払は夫→妻が正、妻→夫が負。支払日はYYYY-MM-DD、処理日時はUTC。訂正は取消と置換支払を同一batchで保存し、元行を削除しない。履歴のUPDATE/DELETEはトリガーで拒否する。

3明細テーブルのINSERT/UPDATE/DELETEはAFTERトリガーで対象世帯・月のrevisionを加算する。明細の編集は禁止しない。分類だけのAI更新はsnapshot対象外のためrevisionを変えない。振込操作は同一読取batchで作った見積りを、操作INSERT時のrevisionトリガーと単一書込batchで検証する。編集が先なら再確認、記録が先なら編集後の差額へ反映する。

コピーは明細だけを対象とし、振込状態・履歴を次月へ引き継がない。支払正味合計はBigIntで計算し、最終値の安全整数を検証する。
