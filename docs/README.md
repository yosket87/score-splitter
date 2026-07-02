# Score Splitter（家計計算アプリ）

夫婦間の家計を公平に管理・精算するための専用Webアプリケーションです。

## 概要

毎月の収支を記録し、自動的に精算金額（誰から誰へ、いくら支払うか）を計算する機能を中心に設計されています。

## 主な機能

- **収入・支出・繰越の管理**: 月単位でのデータ入力・編集・削除
- **担当者別管理**: 夫/妻それぞれの収支を分けて管理
- **自動精算計算**: 公平な精算金額を自動計算
- **月データコピー**: 前月のデータを当月にコピー可能

## ドキュメント構成

| ファイル | 内容 |
|---------|------|
| [architecture.md](./architecture.md) | ディレクトリ構造・アーキテクチャ |
| [tech-stack.md](./tech-stack.md) | 使用技術スタック |
| [components.md](./components.md) | コンポーネント構造 |
| [features.md](./features.md) | 主要機能の詳細 |
| [database.md](./database.md) | データベース設計 |
| [testing.md](./testing.md) | テスト構成 |
| [configuration.md](./configuration.md) | 設定ファイル |

## クイックスタート

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# テストの実行
npm test

# E2Eテストの実行
npm run test:e2e
```

## 環境変数

`.env.local` ファイルに以下の環境変数を設定してください：

```
CLOUDFLARE_WORKER_API_URL=your_worker_api_url
CLOUDFLARE_WORKER_API_TOKEN=your_worker_api_token
APP_PASSWORD_HASH_BASE64=your_password_hash_base64
```
