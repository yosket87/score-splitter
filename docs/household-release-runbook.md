# 世帯分離の段階リリース手順

対象: Issue #102。これは実行手順であり、本番適用済みの証跡ではない。本番操作は、対象SHA・検証結果・バックアップPASS・停止/切り戻し手順を提示して明示承認を得た後に行う。

## 段階ごとの配布物

| 段階 | ブランチ/PR | DBとコードの状態 |
|---|---|---|
| 1 バックアップ | `feat/102-backup-schema` / #119、01947d8 | schemaVersion 3、全業務表復元検証。migration追加なし |
| 2 互換追加・補完 | `feat/102-household-expand` / #120、ec09c41 | 0009/0010だけ。旧SQL稼働可、NULL書込の追補が必要 |
| 3 利用切替 | `feat/102-household-scoped` / b15531d（未push） | 世帯対応全経路＋0011。全アクセス停止中に切替 |
| 4 最終制約 | 実装SHA 6355a92（未push） | 0012。対応版だけの稼働と所属整合性が前提 |

後段migrationを含むcheckoutから、段階2のために通常のpending一括適用を実行しない。適用対象は必ず当該段階のSHAへ固定する。段階3/4の途中commitを共有devへ自動配備しない。

## 実環境照合で判明した配備ゲート

2026-09-05、#120のpushで旧APIのWorkers Buildsも起動し、Version `c14dadd0-66e0-4c04-8e72-b5daf8fcca3f` が生成された。DB bindingは本番 `7f8d3531-a833-4474-84d5-cee3ac98ee96`。本番配分は従来の `cb04cc9c-e780-4562-b69b-8185639ff075` の100%を維持し、0009/0010は未適用だった。

このため、段階3のpushは旧APIの非本番ブランチupload停止または独立検証DBへの隔離を先に確認してから行う。既存Previewの到達停止も切替ゲートに含める。本番設定の変更は別途承認を得る。

Dashboardの読取確認では、旧APIの「設定 → ビルド → 非本番ブランチのビルド」が有効だった。非本番コマンドは `npx wrangler versions upload --config cloudflare/worker/wrangler.jsonc`。このチェックを無効にする操作は承認待ちで、設定は変更していない。既存Previewのrouting停止とは別操作として扱う。

## 検証環境

ローカルの隔離D1は `npm run test:d1:household-migrations` で作成され、実環境へ接続しない。段階2では0008までの履歴入りfixture、0009の旧SQL互換、0010の値保持、途中失敗rollbackと再適用を検証する。全経路完成後は最終migration適用済みの隔離DBで2世帯試験を行う。

共有dev D1は古いPR Previewと共有される。世帯未対応のPreviewが到達可能な間は2世帯fixtureを投入しない。実環境の移行演習には独立D1と、そのDBだけをbindingした検証Workerを用いる。DB UUID・Worker名・URLを記録し、本番/共有devと異なることを適用前に照合する。

## 切替直前の記録

1. 本番root Worker、旧API Worker、開発Workerの実稼働Versionと配分を取得する。設定ファイルだけでなく各VersionのDB bindingを照合する。
2. 同じD1に到達するCustom Domain・workers.dev・versioned Preview・Branch Alias・service bindingを列挙する。Git連携の本番Deploy commandと実行中/待機中Buildを記録する。
3. 適用済みmigration、業務表集合、世帯集合、所属NULL/不明所属/越境FKの件数を確認する。ログへtoken・公開鍵・家計明細・Secretを出力しない。
4. 最終対象HEADで全量バックアップを取得し、schemaVersion 3のPASSを確認する。取得値と移行後の件数・金額・revision・台帳JSONの保持を照合できるよう、比較資料はバックアップと同じprivate領域に置く。

## 段階3の停止と切替

1. 本番のGit自動デプロイを保留し、保留設定を再読込する。既に進行しているBuildも終端状態まで確認し、保留後の試験Buildが配備前に止まることを確かめる。
2. rootと旧APIの全家計リクエスト・認証発行を停止する。ブラウザのメンテナンス表示だけでなく、直接HTTPと別ホストからも到達不能であることを確認する。新しい実装のフラグだけでは古いVersionを停止できない。
3. Previewの停止はversioned URLとalias URLの両方へ効く設定を使う。CloudflareのPreview URLs無効化は両方のroutingを止める。ただしworkers.dev本体とCustom Domainは別途確認する。Dashboardでの変更は次のWrangler配備で戻り得るため、切替用の設定と整合させる。[Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)、[workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
4. AIの新規実行を止め、稼働中リクエストの終了とlease期限を確認する。期限切れだけを遅延書込が不可能な証拠にしない。古い処理からDBへ書込できない状態を確定する。
5. 停止中の最新バックアップを取得し、切替直前にHEAD一致・30分以内・全復元検証を再確認する。古いPR HEADのPASSを流用しない。
6. 0011の最終NULL補完・キー/trigger切替を適用し、schema・保持値・FK・immutable保護を検証する。失敗時は停止を維持する。世帯非対応コードを再開しない。
7. 同じ対象SHAの世帯対応root/旧APIを配備する。対応しない入口はDBへ到達できない状態を維持する。旧Previewへの到達を実URLで再確認する。
8. 配備後も全入口の停止を維持する。0011完了時点では再開せず、そのまま段階4へ進む。

## 段階4と切り戻し

1. 全入口の停止を維持し、配備版が世帯対応版だけであること、不明所属・必要所属NULL・越境参照が0件であることを確認して0012を適用する。
2. 制約・全保持値・FK・immutable保護を検査する。0012失敗時は0011のschemaと値へのrollbackを確認し、停止を維持する。旧版を再開しない。
3. 0012成功後、公開入口の停止を維持した管理下の確認経路で、既存セッション・既存パスキー・パスワード・一覧・明細編集・コピー・AI・振込の既存世帯smokeを実施する。本番へ架空世帯を追加しない。
4. smoke成功後、記録した世帯対応Versionだけに100%配分して公開入口を再開する。Version・DB UUID・対象SHAを記録し、旧入口が停止したままであることを再確認する。
5. 再開後の確認が成功してからGit自動デプロイを再開する。

0009/0010は旧SQLと互換だが、0011後は旧版へコードだけ戻さない。移行失敗はまずmigrationのrollback状態を確認し、成功済みの非互換切替後は対応版の修正を優先する。バックアップ/Time Travelからの復元は新規書込を失う可能性があるため、対象時点・影響・再照合を提示し、別の明示承認を得て行う。自動復元しない。
