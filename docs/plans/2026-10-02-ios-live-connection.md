# iOS実接続とデモ撤去

## 仕様
ユーザーの「デモ用の画面とかは要らない。次を実装して」を受け、前段で提示した実認証・開発API接続へ進む。本番変更は対象外。現在の未コミット初期実装を維持して更新する。

## Task 1: デモ撤去と実認証導線
所有apps/ios/（Configの実接続値は親担当）。デモ画面・入口・fixture・isDemo条件・--demo挙動を完全削除する。実際のセッションだけで認証状態に入り、通常起動は実ログインへ。UIテスト用にもアプリにデモ経路を残さない。Coreの通信テストのテスト専用fixtureは維持。設定不足のUIテストは残す。実接続のログイン画面の検証テストを追加する。
Google/Apple有効フラグをxcconfig→Info.plist→IdentityProvider/LoginViewへ反映し、無効providerを表示しない。設定不足を一般的な接続エラーとして表示。開発環境Google有効・Apple無効で親と接続する。GOOGLE_SIGN_IN_ENABLED/APPLE_SIGN_IN_ENABLEDをYES/NO形式で使う。Bundle IDはapp.yamawake.ios.dev。実設定は親がConfig/Local.xcconfigとConfig/GoogleService-Info.plistを用意するので触らない。READMEのデモ説明は削除し実ログインの手順へ更新。
Xcodeプロジェクト再生成、Core tests、Simulator build、UI testsを実施。UI操作は親へタイミング共有し衝突回避。外部ログイン・本番接続は勝手に試さない。commit/pushなし。

## Task 2: 開発環境接続
親が既存Firebase iOS appを調べ、なければ開発Bundle IDで登録し公開設定を取得する。開発APIをビルド・配備し未認証拒否とWeb応答を確認する。既存D1 schema変更なし。ユーザー認証操作は本人に委ねる。設定取得がログイン権限で止まる場合は具体的な不足だけを質問し独立作業は完了する。

## Task 3: レビューと実機導線
今回のコード差分をレビューし重要指摘を解消する。Simulatorに実ログイン画面を表示、実認証の成功と未実施を区別する。docs/ios.mdの旧デモ記載を訂正する。
