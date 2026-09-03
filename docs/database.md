# データベース設計

## 概要

Cloudflare D1（SQLite）を使用したデータベース設計です。本番・開発とも、Next.js/OpenNextのWorkerが `DB` bindingでD1へ直接アクセスします。D1ドメイン関数は `cloudflare/worker/src/` と共有し、同ディレクトリの `index.ts`（HTTP入口）経由のアクセスは `USE_MOCKS=true` のモックテストまたは切り戻し用に限定します。

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
| created_at | TEXT | 作成日時（ISO文字列） |
| updated_at | TEXT | 更新日時（ISO文字列） |

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
- D1のCHECK制約

## マイグレーション

D1マイグレーションは `cloudflare/worker/migrations/` に配置しています。

## 環境分離とバックアップ

- 本番Worker `score-splitter-web` は本番D1 `score-splitter` に接続する
- 開発Worker `score-splitter-dev` は開発D1 `score-splitter-db-dev` に接続する
- PR Previewは共有の開発D1を使用し、本番D1のデータを開発環境へコピーしない
- 本番D1へbindingを変更・デプロイする前に、必ず `npm run backup:d1:production -- --confirm-production-d1 <本番D1 UUID>` を実行する
- バックアップscriptはTime Travel bookmark、全量SQL、SHA-256、SQLite復元の整合性・全8テーブルの件数照合を検証し、`PASS` manifestを作成する。PASSがない状態で本番PRをReadyに変更・merge・本番デプロイしてはならない
- バックアップはGit管理外の `~/Documents/Backups/score-splitter/d1/` に保存する。Time Travelのrestoreはデータ破損時にユーザーが明示承認した場合だけ実行する
