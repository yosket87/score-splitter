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

### sessions

Cookieにはトークンのみを保存し、期限・認証方式・personはD1に保存します。

### passkey_credentials

WebAuthnの公開鍵はJSON APIで扱いやすいように`public_key_base64`へBase64文字列として保存します。

### webauthn_challenges

パスキー登録・認証用の短命チャレンジを保存します。期限切れデータはWorker API側で削除します。

## 設計上の注意点

入力時は支出・繰越も正の値で入力し、Server Actionsで負の値に変換して保存します。

D1にはRLSがないため、以下で保護します。

- Worker APIの共有シークレット認証
- ブラウザにWorker APIトークンを出さない
- 用途別のドメインAPI
- D1のCHECK制約

## マイグレーション

D1マイグレーションは `cloudflare/worker/migrations/` に配置しています。
