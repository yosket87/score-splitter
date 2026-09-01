# データベース設計

## 概要

Cloudflare D1（SQLite）を使用したデータベース設計です。アプリ本体はD1へ直接接続せず、Cloudflare Worker API経由でアクセスします。

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

月ごとの最新診断と月単位の実行leaseを保持します。履歴は保存せず、月単位でupsertします。

| カラム | 型 | 説明 |
|-------|---|------|
| id | TEXT | 主キー（Workerで生成） |
| month | TEXT UNIQUE | 診断対象月（YYYYMM） |
| result_json | TEXT NULL | 検証済み4ブロック診断。leaseのみの行はNULL |
| input_hash | TEXT NULL | 対象4か月の診断入力指紋 |
| analysis_version | TEXT NULL | 集計・プロンプト契約のバージョン |
| run_token | TEXT NULL | 実行所有者を示す一時トークン |
| run_expires_at | TEXT NULL | lease有効期限 |
| created_at | TEXT | 作成日時（ISO文字列） |
| updated_at | TEXT | 最終更新日時（ISO文字列） |

診断開始時はD1の条件付きUPDATEで2分間のleaseを取得します。保存・解放は取得時と同じ`run_token`に限定し、期限切れ・別runの書き込みを409で拒否します。分類保存も対象月と世帯全体guardのtoken・期限を同一SQL内で確認し、`id + expectedLabel + ai_category IS NULL`のcompare-and-setが全件成立する場合だけ更新します。`input_hash`または`analysis_version`が現在値と異なる場合も保存結果は削除せず、期限切れとして明示的な再診断を促します。

診断context APIは担当者を除外し、収入は月別合計に必要な金額だけを扱います。AI内部カテゴリ、担当者、収入ラベル、認証情報、レコードIDは通常APIまたはOpenAIの診断文payloadへ露出しません。

### ai_execution_guard（AI診断の世帯全体guard）

単一行（`id = 1`）で、異なる月を含むAI診断の同時実行と利用回数を管理します。

| カラム | 型 | 説明 |
|-------|---|------|
| id | INTEGER | 常に1となる主キー |
| run_token | TEXT NULL | 現在の世帯全体実行所有者 |
| run_expires_at | TEXT NULL | 世帯全体leaseの有効期限 |
| last_started_at | TEXT NULL | 直近の診断開始日時 |
| usage_date | TEXT | UTC基準の利用日（YYYY-MM-DD） |
| daily_count | INTEGER | 利用日の開始回数 |
| updated_at | TEXT | 最終更新日時（ISO文字列） |

月leaseと世帯全体guardはD1 `batch()`のtransactionでまとめて条件付き取得します。同時実行は1件、cooldownは5秒、UTC日次上限は20回です。busyは409、cooldownまたは日次上限は`Retry-After`付き429を返します。診断保存または所有tokenによるlease解放で`ai_diagnoses.run_token`をNULLへ更新すると、triggerが同じtokenの世帯全体guardを解放します。

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

WebAuthnの公開鍵はJSON APIで扱いやすいように`public_key_base64`へBase64文字列として保存します。

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

パスキー登録・認証用の短命チャレンジを保存します。期限切れデータはWorker API側で削除します。

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

- Worker APIの共有シークレット認証
- ブラウザにWorker APIトークンを出さない
- 用途別のドメインAPI
- D1のCHECK制約

## マイグレーション

D1マイグレーションは `cloudflare/worker/migrations/` に配置しています。
