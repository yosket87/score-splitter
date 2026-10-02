# ヤマワケ iOS

iOS 17以上のSwiftUIクライアントです。Webと同じ世帯・明細をHTTPS `/api/v1` で操作します。精算と月収支はサーバーの結果を表示し、Swiftで計算を複製しません。

## 開く・ビルドする

Xcode 26.5で検証済み。`ScoreSplitter.xcodeproj`を開き、共有Scheme `ScoreSplitter` とiPhone Simulatorを選びます。公式Firebase Auth/CoreとGoogle Sign-InをSPMで解決します。`Package.resolved`をコミット対象とし、初回取得にはネットワークが必要です。

```sh
xcodebuild -project apps/ios/ScoreSplitter.xcodeproj -scheme ScoreSplitter \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/score-splitter-ios-derived CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES build
```

プロジェクトは自己完結したpbxprojと共有Schemeを同梱します。Swiftファイルの追加時は標準Pythonだけで再生成できます（XcodeGen/Rubyは不要）。手動で追加したプロジェクト設定は先に生成スクリプトへ反映してください。

```sh
python3 apps/ios/scripts/generate-project.py
```

## 実サービス設定

1. `Config/Local.xcconfig.example`を`Config/Local.xcconfig`へコピーし、API URL（末尾`/api/v1`）、Web URL、登録するBundle ID、Apple Team ID、Google reversed client IDを設定します。xcconfigでは`https:/$()/...`と書き、`//`のコメント化を避けます。
2. 開発用Bundle IDは`app.yamawake.ios.dev`です。FirebaseのiOSアプリとApple DeveloperのApp IDに同じIDを登録してください。
3. 同じFirebaseプロジェクトの`GoogleService-Info.plist`を`Config/GoogleService-Info.plist`へ置きます。ビルド時にbundleへコピーします。Bundle IDが一致しない場合はログインを無効化します。
4. Firebase Authenticationで使用するproviderを有効化し、`GOOGLE_SIGN_IN_ENABLED`と`APPLE_SIGN_IN_ENABLED`を`YES`/`NO`で設定します。無効なproviderのボタンは表示しません。開発環境はGoogleを`YES`、Appleを`NO`にします。Apple側でSign in with Apple capabilityと必要なキー/サービス設定、Firebase側のApple provider設定を完了します。GoogleのURL schemeは`REVERSED_CLIENT_ID`と一致させます。
5. サーバーでFirebase project/providerの許可設定と、Webでのアカウント連携・世帯所属を完了します。未知UIDは`web_link_required`の案内が出ます。iOS単独で世帯を作成したり、旧方式の移行秘密を入力したりする機能はありません。
6. 実機のSigning Teamを設定して実ログイン・CRUDを確認してください。外部providerログインと実データのCRUDは、接続設定後に利用者が確認してください。

開発/本番は別のBundle IDと`Local.xcconfig`/Firebase plistを使用してください。API base URLのSHA256をKeychain serviceへ含めるため、API接続先を変更しても旧環境のBearerを新環境へ送りません。配布前にはアプリアイコン、実サービスの規約/プライバシー案内、配布用署名を追加してください。

## 実ログイン

通常起動すると実サービスのログイン画面が表示されます。開発環境ではGoogleでログインし、Webで連携済みのアカウントを使用します。認証が成功してサーバーのセッションを受け取った場合に月詳細へ進みます。

```sh
xcrun simctl install booted /tmp/score-splitter-ios-derived/Build/Products/Debug-iphonesimulator/ScoreSplitter.app
xcrun simctl launch booted app.yamawake.ios.dev
```

## テスト

```sh
swift test --package-path apps/ios/ScoreSplitterCore --enable-code-coverage
xcodebuild -project apps/ios/ScoreSplitter.xcodeproj -scheme ScoreSplitter \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/score-splitter-ios-derived CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES test
```

アプリ側のKeychainテストは実セッションと異なる専用scopeで書き込み・読み取り・更新・削除を検証します。Coreは入力境界、レスポンスdecode、期限切れ、単一flight更新、世帯切替防御、ログアウト後の古い応答破棄、旧Bearerの401、変更の再送禁止、Keychain削除失敗時のremote失効を検証します。UIテストは既定で設定不足時の接続エラーを検証します。実接続画面のテストは既定で理由付きスキップし、接続設定後に下記で明示実行します。Googleログインのみが有効に表示されることを確認し、スクリーンショットを添付します。外部ログイン操作は実行しません。

```sh
xcodebuild -project apps/ios/ScoreSplitter.xcodeproj -scheme ScoreSplitter \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/score-splitter-ios-derived \
  -clonedSourcePackagesDirPath /tmp/score-splitter-ios-packages \
  -only-testing:ScoreSplitterUITests/AppFlowTests/testLiveConfigurationShowsGoogleLoginOnly \
  IOS_LIVE_UI_TESTS=YES CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES test
```

実接続画面のテストは開発Firebase設定で1件実行し成功しました。Googleボタンが有効、Appleボタンと接続エラーが非表示であることを検証済みです。Simulatorではad-hoc署名を有効にします。署名を無効化するとKeychainアクセスに失敗します。手動検証では実Googleログイン、収入の追加・編集・削除、アプリ再起動後のログイン維持まで確認済みです。検証明細は削除済みです。支出・繰越の実接続操作とApple認証は手動検証の対象外です。

## 認証・通信の挙動

アプリBearerを端末専用・ロック解除時のみ読取可のKeychainへ保存します。Cookie・URLキャッシュ・HTTPリダイレクトを使用しません。期限2分前からFirebase ID tokenを取得し、現在のBearer付き`mode: refresh`を単一flightで交換します。期限切れ後はproviderでの再ログインを案内します。Firebase SDKのtoken更新だけでは`auth_time`が更新されないため、期限切れ後のloginに使い回しません。

セッション/世帯/画面の切替後に届いた応答は反映しません。更新前Bearerの遅い401で新しいsessionを消しません。401時に変更を自動再送しません。POST/PUTの結果が不明な通信失敗では保存ボタンを停止し、「閉じて記録を再読み込みする」からサーバー状態を確認します。削除・フラグ変更失敗も記録を再読み込みして確認できます。

## 今回の範囲

月一覧（年間収支・グラフ・未記録月）、月詳細（精算・夫婦別内訳・月収支・お小遣い・推移）、収入/支出/繰越の追加編集削除とフラグ変更、アカウント画面（Googleの画像・名前・メール、外観・担当者・ログアウト）を実装しています。

CSV出力、月コピー、AI診断、振込記録、世帯管理・providerの連携管理、パスキー/旧パスワード認証はiOS未対応です。これらはWeb版を利用してください。

公式手順: [Firebase SPM](https://firebase.google.com/docs/ios/installation-methods)、[Googleログイン](https://firebase.google.com/docs/auth/ios/google-signin)、[Appleログイン](https://firebase.google.com/docs/auth/ios/apple)。

UIテストの未設定ケースはDebug専用引数`--unconfigured`でFirebaseの初期化を明示的に停止するため、個別の接続設定を置いた開発環境でも再現できます。Googleログインは登録済みのreversed client ID schemeが一致する場合のみ有効になり、scheme不足によるSDKの例外を防ぎます。

ログイン後は月一覧がトップです。下タブは置かず、右上のプロフィール画像からアカウント画面へ進みます。ログイン済み開発Simulatorでの画面遷移テストは、上記xcodebuildコマンドに `IOS_LIVE_UI_TESTS=AUTHENTICATED -only-testing:ScoreSplitterUITests/AppFlowTests/testAuthenticatedMonthListAndAccountNavigation` を指定して実行できます。ログアウトやデータ変更は行いません。
