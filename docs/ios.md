# iOSクライアント

SwiftUIによるiOSクライアントを`apps/ios/`で開発する。既存のNext.jsアプリはルートの`src/`に維持し、Cloudflare Workers・D1と認証済みの家計を共有する。

## 構成

```text
Web (Next.js) → Server Actions / RSC ─┐
                                    ├→ 共通D1ドメイン関数 → D1
SwiftUI → /api/v1 Route Handler ─────┘
```

`src/app/api/v1/[...path]/route.ts`がHTTP入口、`src/lib/mobile-api/`が入力・認証・応答処理を担当する。D1の操作・世帯認可は`cloudflare/worker/src/`の既存関数を利用し、精算は`src/lib/utils/calculation.ts`の同じ関数で算出する。iOS側で精算ロジックを再実装しない。

コードの共有とサービスの独立配備を分けて考え、初期版ではAPIも既存Next.js/OpenNext Workerで実行する。API専用Workerへの分離や`apps/web/`への移動は本変更では行わない。DB migrationも追加しない。

## 初期版の画面・機能

Webスマホ版の情報の順序・日本語・配色を引き継ぐ。月一覧、月詳細（精算額・内訳・月収支・お小遣い・明細）、収入/支出/繰越の追加編集削除、繰越/清算フラグ、認証とログアウトが対象。

ログイン後はヘッダー中央に「ヤマワケ」を表示した月一覧を開き、下タブは置かない。月詳細のヘッダーにはタイトルを表示しない。月詳細から標準の戻る操作で一覧へ戻る。月一覧・月詳細の右上には背景のないプロフィール画像ボタンを置き、アカウント画面でGoogleの画像・名前・メール、外観設定、家計の担当者、ログアウトを表示する。プロフィールはFirebaseのGoogleプロバイダー情報を優先し、画像がない場合や読込失敗時は頭文字（名前もない場合は人物アイコン）を表示する。

AI診断、月コピー、CSV出力、振込記録の変更、パスキー管理は後続段階。初期版はオンライン利用を前提とし、オフライン編集や同期キューは提供しない。実装の起動方法とiOS固有の制約は[アプリREADME](../apps/ios/README.md)を参照する。

## 認証

Firebase AuthenticationのiOSアプリをWebと同じ環境のFirebase projectに登録する。開発と本番のproject/Workerは混在させない。Firebaseは本人確認、D1はアプリの利用者・所属・セッション・失効を管理する。

iOSはFirebase ID tokenを`POST /api/v1/auth/exchange`でアプリセッションへ交換する。以後はアプリセッションをBearerとして送信する。WebのCookieや旧Workerの内部共有BearerをiOSへ渡さない。未連携のUIDには`web_link_required`を返し、Webの初回連携・承認を完了してから再ログインする。

更新には有効な現在のアプリBearerとFirebase ID tokenが必要。モバイルのrefreshでは新セッション作成と旧token削除を同じD1 batchで実行する。期限切れ後はproviderで再認証する。既存Webの更新処理は変更しない。Firebaseの失効・D1の所属/epoch確認は既存実装を利用する。

## 通信契約

[API v1](../contracts/mobile-api.md)を参照。年月は既存と同じ`YYYYMM`。入力金額は正の整数、保存/返却は収入が正、支出・繰越が負。すべてのAPI応答をno-storeとし、世帯をリクエスト本文から受け取らない。

iOSアプリは古いバージョンが残るため、v1の既存フィールドや意味を破壊する変更を避ける。API専用Workerへ移す際もこの通信契約を維持する。

## 検証

- `tests/unit/mobile-api/`: HTTP入力、固定エラー、Route Handlerから既存関数への接続。
- `tests/integration/mobile-api/d1.test.ts`: SQLiteで既存のD1関数を実行し、他世帯・期限・失効・所属・CRUD・refresh競合・ロールバックを検証。
- iOSのビルドとテストはアプリREADMEを参照。
- デモ画面・固定データへの切替は提供しない。通常起動は実ログイン画面を表示し、有効なAPIセッションを取得してから家計を開く。
- 署名なしシミュレータビルドや通信の自動テストは、実際のApple/Google認証の成功を証明しない。実認証はFirebaseアプリ登録・provider設定後に本人のアカウントで確認する。

## 開発環境の接続

開発用Bundle IDは`app.yamawake.ios.dev`、Firebase projectは`yamawake-dev-7e298`、APIは`https://score-splitter-dev.bluespec.workers.dev/api/v1`を使用する。既存Webと同じ開発D1へ接続する。

Googleは有効、AppleはFirebase側の設定が未完了のため無効とする。iOSも`GOOGLE_SIGN_IN_ENABLED`と`APPLE_SIGN_IN_ENABLED`で表示を制御し、使えない認証方法を案内しない。Firebaseの公開設定は`Config/GoogleService-Info.plist`、環境の値は`Config/Local.xcconfig`に保存し、Gitへ含めない。

2026-10-02に開発Workerへ共通APIを配備した（version `b0678328-5488-4338-af74-452f37b6e984`）。開発D1の追加migrationは不要だった。Webの`/login`は200、未認証の`/api/v1/auth/session`と`/api/v1/months`は401のJSON応答を確認。macOSのURLSessionでもセッションAPIの401・no-storeを確認した。

2026-10-02に管理者の再ログイン後、開発Firebaseへ`app.yamawake.ios.dev`を登録し、公式plistとGoogleのURL schemeを取得・設定した。Firebase app IDは`1:656885503577:ios:cf9b0da9002cb9f37b8348`。本番環境は変更していない。

Simulatorもad-hoc署名でビルドし、実Keychainの書き込み・読み取り・更新・削除を含むUnit19件とUI2件がスキップなしで成功した。Googleの認証画面への遷移まで確認済み。署名なしビルドではKeychainアクセスに失敗するため、アプリREADMEの署名付きコマンドを使用する。

本人による実Googleログイン後、Simulatorで2026年10月の月詳細取得と収入1件の追加（120円）・編集（240円）・削除を確認した。月収支と精算額の再計算、開発D1への保存・更新、削除後の検証明細0件も確認済み。アプリを終了・再起動した後もログイン状態が維持され、月詳細を再取得できることを確認した。既存明細は変更していない。支出・繰越の実接続操作とApple認証は、この手動検証の対象外。

月一覧起点への変更後、Unit22件とログイン済みUIテスト1件が成功した。月一覧→アカウント→月一覧→月詳細→月一覧の遷移、プロフィール表示、下タブがないことを検証済み。

## Webデザイントークンとの対応

`src/app/globals.css`を色・サーフェスの基準とし、`Theme.swift`の`Palette`へライト／ダーク両方の値を対応させる。`DesignTokens.swift`に余白・角丸・文字・サーフェスを集約する。

| Web側 | iOS側 |
|---|---|
| `--app-ambient-base` と夫・妻の放射グラデーション | `AppBackground` |
| `--app-solid-panel-background` | `Palette.card`、通常の`surface()` |
| `--app-glass-heavy-background`・境界・影 | `surface(glass: true)` |
| `--app-glass-sticky-background` | `StickySurface` |
| `--muted-foreground` | `Palette.mutedForeground` |
| `--husband-light` / `--wife-light` | 担当者バッジの背景 |
| `--accent` / `--app-destructive` | 収入／支出明細と収支の正負 |
| `--income` / `--expense` | 収支グラフの意味色 |
| `text-xs/sm/base/2xl/3xl/4xl` | `WebText`の12/14/16/24/30/36pt（Dynamic Type対応） |
| `font-mono` | 金額の等幅フォント |
| `rounded-2xl` / 年間24px / 精算28px | `Radius.panel` / `.annual` / `.hero` |

CSSのbackdrop-filterはSwiftUI Materialと指定RGBA色の重ね合わせで近似する。影のぼかしはレンダラーが異なるため同一ピクセルを保証しない。透明度低減・高コントラストでは不透明面へ切り替え、高コントラストでは影を消して境界を強調する。戻る操作、フォーム部品、ヘッダーはiOS標準を維持し、プロフィール画像ボタンには背景を付けない。Webの文字をptへ対応させつつDynamic Typeで拡大し、細かな補助表示は12ptを下限とする。

トークン反映時はUnit22件に加え、実ログイン済みUIの通常ライト表示と、ダーク＋accessibility-large＋高コントラストで画面遷移を検証した。文字拡大時の年間グラフは横スクロールへ切り替える。シミュレータの表示設定は検証後に元のlight／large／コントラスト標準へ復元する。

ログイン画面はWebの`login-form.tsx`と同じブランドマーク・見出し・中央の半透明カード・テーマ切替を使用する。GoogleボタンのPNGとGoogle SansはWebの既存ファイルをXcodeのリソースとして参照し、OFLライセンス本文も同梱する。iOSで利用可能な認証方法のみ表示し、初回のWeb連携案内は「ログインでお困りの方へ」から展開できる。
