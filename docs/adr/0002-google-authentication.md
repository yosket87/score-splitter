# ADR 0002: Googleの認証主体と世帯所属を分けて既存利用者を移行する

日付: 2026-09-06。状態: 段階実装中。対象: [Issue #103](https://github.com/yosket87/score-splitter/issues/103)。

既存2人のGoogleログインを導入する。世帯分離済みのD1データアクセスを維持し、Googleの認証結果から個人を識別した後、アプリ側の有効な所属で家計へのアクセスを認可する。

## 認証の境界

GoogleのAuthorization Code FlowとPKCE S256を使う。OIDCの処理はWeb APIで動く`oauth4webapi`へ委譲し、アプリ側はstate・nonce・固定callback・署名検証・安全なエラー変換を明示する。ライブラリは3.8.8へ固定して導入し、依存の更新時に同じ契約試験を実行する。

Arcticは2026年7月に非推奨化されたため採用しない。認証基盤全体を置き換える方式は、既存セッションとの併存と所属認可の変更が広がるため今回採用しない。[oauth4webapi](https://github.com/panva/oauth4webapi)、[Arcticの告知](https://arcticjs.dev/)

スコープは`openid email`。メールは表示補助であり、同一人物判定・自動連携・所属許可には使わない。個人の外部識別子はGoogleが署名したIDトークンを検証して得たissuerとsubjectである。新しいWebクライアント用にissuerは`https://accounts.google.com`へ固定する。旧表記のissuerを受理するためにtokenを書き換えない。[Google OIDC仕様](https://developers.google.com/identity/openid-connect/reference)

認証試行ごとにstate・nonce・verifierを生成する。ブラウザへの紐づけと一度きりの消費は認証試行ストアで管理し、OIDCモジュールには保存済みの期待値を渡す。検証モジュールは任意のユーザーIDや世帯IDを返さず、検証済みのGoogle主体と表示用メールだけを返す。

code交換後にIDトークンの署名を明示検証する。TLS通信による発行元確認と、JWTの署名確認を同じものとして扱わない。Google access tokenやrefresh tokenは家計セッションとして使用せず、offline accessも要求しない。不要なtokenを永続保存しない。

## 個人、所属、担当者

- `users`がアプリ内の個人を表す。
- `google_identities`がGoogle主体と個人を結ぶ。同じメールの異なる主体を統合しない。
- `household_memberships`が個人と世帯を結ぶ。ログイン成功だけで所属を作らない。
- `husband / wife`は家計上の担当者であり、認証主体でも権限でもない。移行時に既定担当者を確認するが、過去の明細を付け替えない。

旧パスワードのsession.personはnullであり、旧パスキーのpersonも登録者が選択できた。この値からGoogle主体の所有者を推定しない。

## 一度きりの移行

未知のGoogle主体には家計セッションを作らず、短期の移行申請と照合コードだけを作る。運営が既存の本人と照合し、申請に保存されたGoogle主体に対して既存世帯への一度きりの許可を付ける。メール入力、共有パスワード、他人のコードの所持だけでは所属を取得できない。

同じ主体の再Googleログインで許可を消費し、個人・外部主体・所属・セッションを原子的に確定する。SQLの条件付き更新が0件でも成功扱いとなる点を考慮し、消費権を取得できなかった処理はbatch全体を失敗させる。途中失敗と同時消費を実D1相当の試験で確認する。

## セッションと認可

既存の256bit乱数を使う不透明セッションとhost限定HttpOnly Cookieを利用する。Googleセッションには個人と所属、失効世代を持たせる。共通のセッション取得で期限・個人の有効性・現在の所属・失効を確認する。

Server Actions、RSC、旧HTTP入口は同じ境界を通る。ミドルウェアのCookie形式確認やUIの非表示を認可の代わりにしない。所属解除後の次のリクエストを拒否し、再所属で古いCookieを復活させない。

本人の全端末ログアウトはパートナーのセッションへ影響させない。処理中の古いcallbackにも失効を適用する。Googleアカウントを利用できない場合はGoogle側の復旧を案内し、必要な再紐づけは運営の本人確認・旧主体停止・全端末失効を伴う別の一度きりの手続きにする。

## 既存データと互換期間

旧セッションへ個人IDを推定補完しない。互換期間は旧方式のuser_idをNULLで保持し、Google方式だけ個人と所属を必須にする。振込台帳の認証方式制約もGoogleへ拡張する。過去のactor・JSON・revisionは変更せず、履歴の型を現在のSession型から分離する。

2人がそれぞれGoogleで再ログインし既存家計を確認した後、旧認証を終了する。`legacy_auth_key`は旧振込チェックの対象世帯識別に必要なので保持し、ログイン可否は別の停止状態で表す。

互換migrationには停止日時が設定された場合だけ働くDB制約を追加する。2名の実利用確認に依存する最終停止は、後段PRの運営操作として原子的に実行する。空DBから期待schemaを生成するバックアップ検証を壊さず、migrationの一括適用だけで旧方式を停止させない。停止後は旧方式のsession発行をDB側でも拒否し、振込の過去履歴を保持する。

## 配備と検証

本番と開発はOAuthクライアント・Secret・固定callback・D1を分ける。動的PR PreviewをOAuth callbackへ自動登録しない。実Googleの統合試験は対象SHAを固定開発Workerに配備して行い、モック画面試験と区別する。

第1段階はプロトコルの実装と署名fixtureによるWorkers検証。DB/Routeへの統合、実Googleログイン、2人の本番移行は後続段階であり、第1段階の成功を移行完了としない。

新schemaのバックアップ対応は、追加migrationと同じリリースで準備し、適用前にその版のバックアップを使用する。存在しないmigrationを実環境に適用済みと見なす例外は追加しない。

詳細: [実装計画](../../plans/004-google-login-migration.md)、[段階リリース手順](../google-auth-release-runbook.md)。
