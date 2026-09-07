# Google・Appleログイン

認証はFirebase Authentication、家計の所属・個人ID・セッション・振込履歴はCloudflare D1で管理する。FirestoreやFirebase Hostingは使用しない。WebはFirebase Web SDKを使い、将来のiOSアプリも同じFirebase projectの利用者へ接続する。

## 本人と家計の対応

Firebaseの`projectId + uid`をD1の`users.id`へ対応させる。Google/Appleやメールアドレスを家計の主キーにしない。メール一致で既存家計へ参加させない。Firebase側もAuthenticationの設定で「同じメールアドレスの複数アカウントを許可」を選び、メールによる暗黙の統合を避ける。GoogleとAppleを同じUIDにする操作は、ログイン済み本人が設定画面で明示的に連携する。

Appleの非公開メールとGoogleの情報が結び付く場合を含め、追加連携の前に画面で同意を得る。すでに別UIDへ登録した認証情報は自動統合しない。既存の方法でログインするか、管理者による本人確認へ進む。

未知UIDにはブラウザへ紐づく短期申請を発行する。管理者は従来からの信頼できる連絡手段で本人と照合コードを確認し、既存家計・担当者・対象利用者を指定して承認する。既存Google利用者の初回Firebase連携では同じ`users.id`を指定し、利用者を二重に作らない。復旧も同じ利用者IDを保持し、古いFirebase identityを失効させる。

## セッションと失効

Server Actionで固定Origin/Hostを確認し、WorkersのWebCrypto/joseでFirebase署名とclaimを検証する。公式の公開証明書とaccounts:lookup以外へは接続しない。後者でUID、disabled、validSinceを確認する。サービスアカウントの秘密鍵は使用しない。

初回ログインは5分以内の`auth_time`が必要。継続更新は、Cookieに同じUIDの有効なD1セッションがある場合のみ許可する。セッションはFirebase ID tokenの`exp`以下、最大1時間。開いているWeb画面はSDKのID token更新でセッションも更新する。期限切れで再訪した場合は再ログインが必要。

通常ログアウトはFirebase SDKの状態と家計Cookieを削除する。更新時の一時的な通信障害は60秒後に再試行し、現在の家計セッションとの不一致など、再ログインが必要と判定できる場合はSDK状態を削除する。署名検証やFirebase側失効を含む検証器のエラーは共通化されるため再試行となるが、セッションは更新せず既存の期限を維持する。成功済みの同じID tokenを画面遷移のたびに交換しない。外部検証前に接続元ごと15分30回、未知UIDの申請作成は15分5件までの原子的な制限を設ける。

アプリの全端末ログアウトでは`session_epoch`と`firebase_auth_time_floor`を更新する。古い`auth_time`のトークンは、ID tokenを再発行しても再入場できない。同秒の再認証も拒否するため、直後に失敗した場合は再度ログインする。パートナーの利用者IDは変更しない。

Firebase Consoleでの無効化・失効は次のセッション交換時に反映される。発行済みのD1セッションが切れるまでは最大1時間の差がある。アプリ側で即時失効させたい場合はアプリの全端末ログアウトまたはD1の管理手順を利用する。Firebaseのrefresh token自体をアプリ側で破棄したとは扱わない。

## 開発環境の設定

1. ヤマワケの管理用GoogleアカウントでFirebase Consoleへ入り、開発用projectを選択または作成する。本番とはprojectを分ける。
2. Webアプリを登録する。AuthenticationでGoogleを有効化し、サポート用メールと公開表示名を設定する。
3. Authenticationの承認済みドメインへ`localhost`と固定開発Workerのホストを追加する。動的PR Previewホストは追加しない。
4. アカウントのリンク設定は上記の複数アカウント許可を選ぶ。メール欠如は正常ケースとして扱う。
5. 以下の公開設定をローカル環境、または`wrangler.jsonc`の`env.dev.vars`へ設定する。Firebase API keyはクライアントへ渡す公開設定。Google/Appleの秘密鍵ではない。

```dotenv
FIREBASE_PROJECT_ID=開発projectのID
FIREBASE_API_KEY=WebアプリのapiKey
FIREBASE_AUTH_DOMAIN=開発projectのID.firebaseapp.com
FIREBASE_AUTH_ORIGIN=http://localhost:3000
FIREBASE_GOOGLE_ENABLED=true
FIREBASE_APPLE_ENABLED=false
```

WorkerのOriginは`https://score-splitter-dev.bluespec.workers.dev`を使用する。localhostのHTTPは開発Nodeプロセスだけ許可する。設定不足時はFirebaseを無効化し、モックへ自動切替しない。Firebaseが有効なら従来のGoogle OAuth開始・callbackは無効になる。

Appleを有効化する際はApple Developer側のSign in with Apple、Services ID、Team ID、Key IDと秘密鍵を設定し、Firebaseが示す認証コールバックURLを登録する。秘密鍵はFirebaseのApple provider設定へ入れ、GitやWorkersの公開varsへは入れない。完了後だけ`FIREBASE_APPLE_ENABLED=true`にする。iOSアプリ追加時は同じprojectへBundle IDを登録し、ネイティブSDKで得たID tokenを使うAPI認証入口を別途実装する（今回のWeb Cookie用ActionをネイティブAPIとして流用しない）。

## 管理者による承認

照合コードと対象世帯IDを`code`・`householdId`として、権限600のJSONファイルへ保存する。次のコマンドは開発D1のUUIDを明示し、照合結果を非公開ファイルへ出力する。

```bash
npm run auth:firebase:admin -- inspect --env dev --confirm-database <開発D1のUUID> --input-file <非公開入力JSON> --output-file <非公開照合結果JSON>
npm run auth:firebase:admin -- approve-migration --env dev --confirm-database <開発D1のUUID> --input-file <非公開承認JSON>
```

承認JSONの共通項目は`requestId`・`code`・`approvedBy`・`confirmationRef`。旧共有ログインからの初回参加は`householdId`・`defaultPerson`・`legacySlot`（`existing-member-1`または`existing-member-2`）を追加する。すでにGoogleの個人IDがある場合は、照合した`targetUserId`・`expectedEpoch`を指定し、同じ個人IDへ接続する。コードやメールの一致だけで承認せず、既存の信頼できる連絡手段で本人を確認する。

復旧は`approve-recovery`を使い、共通項目と`targetUserId`・`expectedEpoch`・`expectedOldIdentityId`を指定する。復旧後は旧identityと個人セッションを失効させ、本人へ再認証を案内する。入力・結果ファイルに個人情報を含むためGitへ追加しない。

## 移行と検証

0013を編集せず0014を追加する。既存Google/旧方式のセッションと振込履歴は元の方式・値のまま保持する。本番適用前には現在HEADに対応した本番D1バックアップの全値・schema・復元検証が必要。本PRだけでは本番適用や旧認証の終了を行わない。PR #126はFirebase移行後に再レビューする。

```bash
npm run test:firebase-token:worker
npm run test:d1:firebase
npm run test:run
npm run typecheck
npm run lint
FIREBASE_AUTH_MOCK=true npm run dev:mock
```

最後のコマンドはローカル画面検証専用。Google/Appleのボタンは合成した同一UIDへログインする。外部providerでの実認証やApple Developer設定の確認にはならない。`NODE_ENV=development`・`NEXT_RUNTIME=nodejs`・`USE_MOCKS=true`・`FIREBASE_AUTH_MOCK=true`が全て必要で、本番では利用できない。Next.jsの開発Server Functionログも無効にし、Action引数のID tokenを出力しない。

実環境ではGoogle/Appleそれぞれの初回ログイン、管理者承認後の同一利用者ID、追加連携後の同一家計、別UIDの拒否、全端末ログアウト、更新後の古い認証時刻拒否を確認する。合成テストの成功と実ログインの成功は別々に記録する。

## 一次資料

- [Firebase ID tokenの検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebaseセッションと失効](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [複数providerの明示的リンク](https://firebase.google.com/docs/auth/web/account-linking)
- [同じメールアドレスの複数アカウント](https://support.google.com/firebase/answer/9134820?hl=en)
- [WebのApple認証設定](https://firebase.google.com/docs/auth/web/apple)

## 開発環境の反映記録（2026-09-07）

開発用Firebase project `yamawake-dev-7e298`とWeb app `yamawake-web-dev`を作成し、Googleを有効化した。公開表示名は「ヤマワケ（開発用）」。Analytics/Gemini/Hostingは利用しない。Authenticationのアカウント設定は「ID プロバイダごとに複数のアカウントを作成」で保存済み。承認済みドメインはlocalhost、Firebase既定2件、固定開発Workerのみ。

開発D1 `51457bd5-8e0e-4645-ad34-86634285af2c`のexportをSQLiteへ復元して整合性を確認後、0014を適用しpending 0件を確認した。開発Worker version `1e3ef9d9-8709-4d37-9776-4090cb98dcbb`へ配備し、Googleボタンの表示を確認した。本番D1・Worker・Firebase設定は変更していない。

初回の実Googleログインで下記のWorkers互換性問題が判明したため修正し、開発Worker version `7cdc562a-1680-435f-bb0d-6cc208e7b6f9`へ再配備した。利用者の普段のブラウザで実Googleログインと参加確認画面を確認し、夫としての承認後、既存家計への表示とD1の申請consumed・所属・Firebaseセッション発行を確認済み。Apple Developer設定・Apple実ログインは未完了。Appleフラグは無効のまま。

### 実Google検証で見つかった互換性の問題

初回の実ログインでは署名鍵取得段階で失敗した。Cloudflare Workersのnative fetchは`redirect: "error"`を受理せず、通信前にTypeErrorとなる。`redirect: "manual"`でリダイレクト先へ追従せず、3xxを含む非2xx応答を拒否する実装へ修正した。外部通信を関数mockへ直接差し替える試験ではruntimeのRequestInit検査を通らないため、workerdのnative fetchを通す回帰試験で確認する。診断ログは固定の段階名のみで、token・メール・外部エラー本文は記録しない。

修正後は実Google公開証明書4件の取得・読み込みをworkerdで確認。native fetch経路の回帰試験、鍵取得・lookupの301/302/303/307/308拒否、全1,679テスト、型検査、開発ビルド・配備に成功した。

## 本番リリース（2026-09-07）

利用者から本番リリースの明示指示を受け、開発とは別のSparkプロジェクト`yamawake-prod`とWebアプリ`yamawake-web-prod`を作成。Googleのみを有効にし、本番Originは`https://app.yamawake.app`とする。旧パスワード・パスキーの最終停止は含めない。

本番D1への追加適用は0014のみ。配備前に対象HEADのバックアップ・SQLite復元・schema/全保存値/外部キーを照合する。CI成功、バックアップPASS、migration適用を確認後にPR125をマージして本番配備する。実ログイン・利用者承認は本番プロジェクトで別途確認し、開発環境の本人紐づけはコピーしない。配備バージョンと実施結果はPRのリリース記録に記載する。
