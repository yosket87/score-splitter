# Firebase認証の実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 各タスクの実装とレビューを実施する。

**Goal:** GoogleとAppleをFirebase Authentication経由で利用し、D1の既存家計と個人IDを保持する。
**Architecture:** Firebase SDK → 同originのセッション交換 → WorkersでJWT/アカウント検証 → D1の個人/所属/session。既存Googleテーブルは履歴資産として保持する。
**Tech Stack:** Next.js 16 / React 19 / Firebase Web SDK / jose / Cloudflare D1 / Vitest / Playwright。
**Spec:** `docs/superpowers/specs/2026-09-07-firebase-auth-design.md`

## Global Constraints

- 0013は変更しない。0014を追加し、全保存値を保持する。
- 許可providerはgoogle.comとapple.comのみ。メール一致で紐づけない。
- Firebase project/UIDとD1 users.idを分離する。本番変更と旧方式終了は別工程。
- 外部通信合計10秒。JWT session寿命はexp以下・最大1時間。
- アプリ全端末失効後はauth_time<=floorを拒否する。
- 実設定未完了を成功扱いしない。Google/Appleの実確認は別途記録。

## Task 1: Workers上のFirebase検証境界

所有ファイル: `src/lib/auth/firebase-token.ts`, `src/lib/auth/firebase-keys.ts`, `tests/unit/auth/firebase-token.test.ts`, `tests/helpers/firebase-token.ts`, `scripts/test-firebase-token-worker.mjs`, `scripts/fixtures/firebase-token-worker.ts`。

インターフェース:
```ts
export type FirebaseProvider = 'google.com' | 'apple.com'
export interface VerifiedFirebaseIdentity {
  projectId: string; uid: string; provider: FirebaseProvider; email: string | null;
  authTime: number; issuedAt: number; expiresAt: number
}
export interface FirebaseVerificationConfig { projectId: string; apiKey: string }
export function verifyFirebaseToken(token: string, config: FirebaseVerificationConfig): Promise<VerifiedFirebaseIdentity>
```
- [x] 先に実RS256署名fixtureで成功/改竄/別project/issuer/kid/alg/期限/未来iat/auth_time/provider/tenant/不正UIDをテストし、RED確認。
- [x] joseで検証。公式x509鍵のcache期限とunknown kid、取得失敗、応答サイズ、timeout、redirect拒否。入力token最大16KiB。
- [x] accounts:lookupへidTokenをPOSTし、唯一のlocalId一致、disabled!=true、validSinceとauth_timeを照合。APIkeyは公開設定だがURL/レスポンスをログしない。通信先固定、lookup結果はキャッシュしない。
- [x] fetch/clock注入はテスト用の明示factoryに閉じ、通常入口にmock/任意URL設定を持たせない。
- [x] Nodeとworkerdで同じ実署名の成功・失敗を確認する。
- [x] 対象テスト、lint、typecheckと独立レビューを通す。

## Task 2: Firebase用D1と原子的な参加・失効

所有ファイル: `cloudflare/worker/migrations/0014_add_firebase_auth.sql`, `cloudflare/worker/src/firebase-*.ts`, `scripts/backup-schema.mjs`, `scripts/backup-identity*.mjs`, `scripts/test-firebase-auth-d1.mjs`, `scripts/firebase-auth-admin.mjs`, `tests/helpers/firebase-sqlite.ts`, `tests/unit/cloudflare/firebase-*.test.ts`, `tests/unit/scripts/firebase-*.test.ts`。共通型とsessions/payment-store変更は親が統合する。

入力identityはTask1の型を型のみimportする。domainは署名検証済みの呼出し専用。
```ts
completeFirebaseLogin(db, runtime, identity): Promise<
  { kind: 'authenticated'; session: FirebaseSessionData } |
  { kind: 'migration_pending'; requestId: string; code: string; browserSecret: string; expiresAt: string } |
  { kind: 'recovered'; userId: string }
>
getFirebaseMigrationDisplay(db, runtime, requestId, browserSecret, code)
approveFirebaseMigration(db, runtime, approval)
approveFirebaseRecovery(db, runtime, approval)
revokeFirebaseSessions(db, runtime, token)
getFirebaseAccount(db, token)
```
- [x] 0013の非空fixtureを入力とし、0014前後の全既存表/列/保存値、FK、trigger、Googleと旧方式の互換性を先行試験。
- [x] Firebase identity/申請、floorとfirebase session列を追加。決済表を再構築する際は子も全値コピー/双方向EXCEPT、DDL異常を拒否、rollbackの故障注入。
- [x] UIDに固定した一度だけの許可、既存Google枠との相互排他、同時消費で1名だけ確定、後段失敗で全rollback。
- [x] session INSERT時に所属・identity・epoch・floor・有効時刻を再検証。全端末logoutで本人floor/epochだけ更新。
- [x] 同users.idへ新UIDを復旧。旧identityは履歴として残して失効。期限切れ承認や旧epochでの消費を拒否。
- [x] CLIは既存Wrangler非公開入力契約を利用し、出力や引数へcode/token/個人情報を出さない。inspect/approve-migration/approve-recoveryを提供。
- [x] backup schema登録と復元後のfloor/session整合性検査を追加し、独立D1とUnitを通す。

## Task 3: Webのログイン・Cookie・設定画面

親が担当: `src/lib/auth/firebase-config.ts`, `src/lib/auth/firebase-client.ts`, `src/lib/api/firebase-auth.ts`, `src/app/actions/firebase-auth.ts`, `src/features/firebase-auth/*`, login/settings/migrationページ、共通session/payment型、wrangler設定、Firebaseローカルmock、テスト。

- [x] 設定不足・異origin・不正token・別UID更新の拒否を先にテストする。
- [x] リクエスト時に非公開server設定を読み、projectId/apiKey/authDomainのみclientへ渡す。Google/Apple enabledフラグは個別。
- [x] Server Actionでoriginとfreshnessを検証、Task1→Task2順に呼び成功後だけCookieを設定する。ID tokenはレスポンス/ログ/DBへ保存しない。
- [x] SDKのGoogle/Appleログイン、キャンセル・エラー表示、同UIDへ追加link、現在のsession本人とFirebase currentUser一致の確認、logoutを実装する。
- [x] 有効D1 sessionの同UID更新のみ古いauth_timeを許可する。失効後はSDK token更新のみでは入れない。
- [x] 開発mockをproductionで封鎖し、正常・空月・375pxのブラウザ検証とE2Eを実施する。

## Task 4: 統合・実環境・PR

- [x] 全体Unit/Integration、lint、typecheck、独立D1、OpenNext build、E2Eを実行する。
- [x] 複数タスクの契約と最終差分をcode-reviewer/security-reviewerで確認し、指摘修正を再検証する。
- [ ] Firebase管理用アカウントを確認して開発projectを選択/作成し、Web app・Google/Apple・許可ドメインを設定する。本人確認/規約等の必要箇所だけユーザーへ引き継ぐ。
- [ ] 正しい開発DBとWorkerに配備して実Google/Appleログイン、本人確認、既存家計、失効を検証する。資格情報が揃わない工程は具体的な未完了条件を記録する。
- [ ] PR #125説明とrunbookをFirebase構成へ更新。#126の依存変更を記録し、旧認証終了や本番配備はしない。

### 2026-09-07 検証状況

実装と独立レビューは完了。最終修正後の1,672テスト、typecheck、lint（既存警告1件）、実D1での同時要求制限・移行/復元/失効、OpenNext build、本番成果物のモック封鎖に成功。既存E2E78件は統合後に成功。Firebase専用E2Eは最終修正後に再検証する。

実Firebase管理アカウントのログイン待ち。Firebase project/provider/許可ドメインとApple Developer設定、開発WorkerへのFirebase版配備、実Google/Appleログインは未完了。本番変更・旧認証の終了は実施しない。
