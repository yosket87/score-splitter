# Google・Apple認証をFirebaseへ移す

## 承認と範囲

2026-09-07にユーザーがFirebase Authentication + Cloudflare Workers/D1を承認。提供する認証方式はGoogleとAppleのみ。PR #125を更新する。既存のusers.id、所属、家計、振込履歴を保持する。0013は適用済みなので変更せず0014を追加する。本番マージ・migration・配備、旧認証終了は今回実行しない。PR #126の最終停止はFirebase移行後の別工程とする。

## 構成

WebはFirebase Web SDKでGoogle/Appleへログインする。Firebase project ID・UIDをサーバーで検証し、D1の利用者IDへ紐づける。メール一致では既存利用者へ結合しない。認証手段を増やす操作はログイン済み本人の明示操作でFirebaseの同UIDへlinkする。別UIDとの自動統合はしない。

WorkersはjoseとWebCryptoで公式Firebase公開証明書からRS256署名、kid、aud、iss、sub、iat、exp、auth_time、email_verified、google.com/apple.comを検証する。未知tenant・anonymous・custom tokenを拒否する。鍵取得先は固定し、Cache-Control期限を超えた鍵を使わない。通信は合計10秒で中断、外部エラーやトークンはログ・レスポンスへ出さない。

セッション交換前に公式accounts:lookupをidTokenで呼び、UID・disabled・validSinceを照合する。UIDに基づく認可はD1。交換は同originのServer Actionで行い、Next.jsのOrigin検証に加えて明示originを照合する。初回ログイン・移行消費はauth_timeが5分以内。継続更新は同じ有効D1 sessionに限り、freshnessを緩和する。

D1 sessionは推測不能な64桁tokenをHttpOnly/Secure/SameSite=Lax Cookieで発行する。有効期限はFirebase ID tokenのexp以下かつ1時間以下。Firebase SDKがID tokenを更新した時に同本人のsessionを更新する。Firebase管理画面の失効は交換時に反映され、既発行D1 sessionは最長1時間で失効する。この限界を運用手順へ明記する。

ヤマワケの全端末ログアウト・所属失効はsession_epochとfirebase_auth_time_floorを更新する。古いtokenのiatがrefreshで増えてもauth_time<=floorは拒否する。アプリ内の失効は即時。Firebase管理権限やservice account keyは不要。Firebaseクライアントのrefresh credential自体をサーバーから破棄したとは扱わない。

## データと本人確認

0014でfirebase_identities(project_id,uid,user_id)、firebase_migration_requests、users.firebase_auth_time_floorを追加。sessionsとpayment_operationsにfirebase方式を追加し、旧Google含む既存行は同値で保存する。FK子の振込表も必要な場合だけコピー・全値照合・復元する。既存のGoogle履歴はGoogleとして保持し、AppleをGoogleと偽って保存しない。

未知UIDはbrowser-boundの短期申請だけを作り、世帯や利用者を自動作成しない。運営が確認コードと既存本人を照合してproject/UID/世帯/担当者に一度だけ許可する。同UIDでの新規ログイン時、許可消費・利用者・所属・sessionをD1 batchで原子的に確定する。Google側の既存移行枠とFirebase側で二重参加を許さない。復旧は旧Firebase identityの停止と同users.idへの新UID割当を監査付きで行い、旧epoch・旧auth_timeからの再発行を拒否する。

## 画面・設定

Firebase設定はリクエスト時に読む。設定不足時は旧方式を維持し、モックへfallbackしない。公開クライアント設定だけをブラウザへ渡す。Google/Appleの有効化は個別設定で制御し、Apple Developerの実設定が揃うまでAppleを成功扱いにしない。固定開発originとlocalhostのみを設定し、動的Previewは実認証を開始しない。

既存画面のスタイルを利用する。確認待ち・認証エラー・キャンセル・期限切れ・全端末ログアウトと追加連携を日本語で案内する。Firebase emulator/mockは明示ローカル開発のみ。production成果物では無効にする。

## 検証とリリース条件

JWT異常系と実署名、未知UIDの拒否、本人/partnerの失効境界、承認競合・期限・batch rollback、Google/Appleで同利用者IDの保持をテストする。workerdでJWT実行、隔離D1で0013非空fixture→0014、全値/FK/trigger/backup復元を検証する。既存Unit/Integration・E2E・typecheck・lint・OpenNext buildも確認する。UIはローカルモックで既存月・空月・375px・操作を目視する。

実Firebase project作成とGoogle/Appleの有効化は正しい管理アカウントのログイン後に行う。実ログインと本人の移行確認はローカル合成試験とは別に記録する。

## 一次資料

- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/auth/admin/manage-sessions
- https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/lookup
- https://firebase.google.com/docs/auth/web/account-linking
- https://firebase.google.com/docs/auth/web/apple
