# 世帯分離の段階リリース手順

対象: Issue #102。これは実行手順であり、本番適用済みの証跡ではない。本番操作は、対象SHA・検証結果・バックアップPASS・停止/切り戻し手順を提示して明示承認を得た後に行う。

## PR #122の切替手順（2026-09-06）

### 今回の前提と承認範囲

利用者は2人で、どちらも操作していないとユーザーが確認済み。今回に限り、利用再開まで2人とも操作しない運用で停止を代替する。Git自動デプロイの保留、全公開入口・旧Previewの物理的な遮断確認はマージの必須条件としない。以下の一般手順にある停止ゲートより、この今回の運用を優先する。旧APIの再配備や2世帯fixtureの本番投入は行わない。

これは切替手順の記録であり、マージ・本番0012適用の実施記録ではない。利用者が操作を再開した場合は、作業中の操作を控えてもらってから続ける。

### 確認済みの状態

- 対象PR: #122。コード検証対象は `519024d12c2d6883d83ee81136e460ac5f4531eb`。main取り込み・指摘修正済み、CI全11件成功、Draft解除済み。
- 本番Worker: `score-splitter`。本番D1: `score-splitter` / `7f8d3531-a833-4474-84d5-cee3ac98ee96`。本番は0011まで適用済みで、0012が未適用。
- 開発D1は0012まで適用済み。移行前の全既存保存値の保持と、Previewのパスワードログイン・月次表示を確認済み。
- 専用のリモートD1で、PRの0012を変更せずに適用し、途中失敗時のrollback、全保存値・索引・trigger・FKの保持、別D1へのexport/restore、復元後の世帯分離を検証済み。検証Workerと専用D1は削除済み。
- 専用D1の初期fixture作成時だけ、旧0008/0010のCASE式をリモートD1が受理する同値の括弧付き表記にした。過去migration一式を無変更で新規適用した検証ではない。
- 本番バックアップ `20260906T062900Z` は取得・再検証PASS。ただし以後のドキュメントcommitやマージでHEADが変わるため、切替時には流用せず取り直す。

### 実施順

1. PRの最新HEADとCIを再確認してマージする。本番Buildが自動起動する場合は対象SHAと結果を記録する。マージだけでD1 migrationが適用されたと判断しない。
2. checkoutを最終マージSHAへ合わせ、作業ツリーがcleanであることを確認する。本番の配備Version・SHA・DB bindingを記録し、世帯対応版であることを確認する。既に当該SHAが正常配備済みなら再配備は不要。未配備の場合は手順4のバックアップPASS後に、このcheckoutから `npm run deploy` でroot Workerを配備し、成功を確認する。`deploy:worker` は旧APIも配備するため使わない。
3. 次のコマンドで本番のpendingを確認する。**0012だけ**でなければ一括適用せず差異を調べる。

   ```bash
   npx wrangler d1 migrations list score-splitter --remote --config wrangler.jsonc
   ```

4. AIなどの実行中処理が終了していること、所属NULL・不明所属・越境参照が0件であることを確認する。最終SHAでバックアップを取得し、表示された新しいmanifestを使って再検証する。

   ```bash
   npm run backup:d1:production -- --confirm-production-d1 7f8d3531-a833-4474-84d5-cee3ac98ee96
   npm run verify:d1:production-backup -- /実際に出力された保存先/manifest.json
   ```

   PASS、HEAD一致、完了から30分以内を確認する。移行前後の比較資料はバックアップと同じprivate領域に保存し、家計明細や認証情報をPR・ログへ貼らない。

5. 最終SHAの世帯対応版が配備済みであることを確認する。配備待ちでバックアップが30分を超えた場合は手順4をやり直す。root設定のDB UUIDを上記の本番UUIDと照合してから0012を適用する。

   ```bash
   npx wrangler d1 migrations apply score-splitter --remote --config wrangler.jsonc
   npx wrangler d1 migrations list score-splitter --remote --config wrangler.jsonc
   npx wrangler d1 execute score-splitter --remote --config wrangler.jsonc --command 'PRAGMA foreign_key_check;'
   ```

6. pendingなし・FK違反0件を確認する。移行前のバックアップと件数・金額・revision・台帳JSONを照合し、NOT NULL・複合FK・索引・triggerの定義が0012の期待値と一致することを確認する。本番のimmutable保護は定義照合と専用D1の検証結果で確認し、振込履歴を試しに更新・削除しない。
7. 既存世帯でログイン、月一覧、明細表示と精算額を確認する。編集・コピー・AI・振込操作は必要な実操作の範囲で確認し、架空の振込履歴は作らない。利用中のパスキーはユーザーの実端末で確認する。配備SHA・Version・本番DB UUID・確認結果を記録して、2人の利用を再開する。

### 失敗時

0012が失敗したら、0011のschema・保存値・migration台帳へrollbackしたことを確認し、利用再開を見合わせる。適用済みの0011を再適用したり、世帯非対応の旧コードへ戻したりしない。0012成功後の問題は対応版の修正を優先する。バックアップやTime Travelの復元は新規書込を失う可能性があるため、復元時点と影響を確認して別途承認を得る。

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

Dashboardの読取確認では、旧APIの「設定 → ビルド → 非本番ブランチのビルド」が有効だった。非本番コマンドは `npx wrangler versions upload --config cloudflare/worker/wrangler.jsonc`。その後、ユーザーが旧APIは未使用で配布不要と確認したため、旧API WorkerのGit接続を解除した。Dashboardのビルド欄が「Git リポジトリ → 接続」になったことを確認済み。以後のpushによる旧APIの本番自動デプロイ・非本番Preview生成は停止。アプリ側のGit連携、既存Worker/Previewのrouting、DBは変更していない。既存Previewのrouting停止とは別操作として扱う。

## 検証環境

ローカルの隔離D1は `npm run test:d1:household-migrations` で作成され、実環境へ接続しない。段階2では0008までの履歴入りfixture、0009の旧SQL互換、0010の値保持、途中失敗rollbackと再適用を検証する。全経路完成後は最終migration適用済みの隔離DBで2世帯試験を行う。

共有dev D1は古いPR Previewと共有される。世帯未対応のPreviewが到達可能な間は2世帯fixtureを投入しない。実環境の移行演習には独立D1と、そのDBだけをbindingした検証Workerを用いる。DB UUID・Worker名・URLを記録し、本番/共有devと異なることを適用前に照合する。

## 切替直前の記録

1. 本番root Worker、旧API Worker、開発Workerの実稼働Versionと配分を取得する。設定ファイルだけでなく各VersionのDB bindingを照合する。
2. 同じD1に到達するCustom Domain・workers.dev・versioned Preview・Branch Alias・service bindingを列挙する。Git連携の本番Deploy commandと実行中/待機中Buildを記録する。
3. 適用済みmigration、業務表集合、世帯集合、所属NULL/不明所属/越境FKの件数を確認する。ログへtoken・公開鍵・家計明細・Secretを出力しない。
4. 最終対象HEADで全量バックアップを取得し、schemaVersion 4のPASSを確認する。取得値と移行後の件数・金額・revision・台帳JSONの保持を照合できるよう、比較資料はバックアップと同じprivate領域に置く。

## 段階3の停止と切替

1. 本番のGit自動デプロイを保留し、保留設定を再読込する。既に進行しているBuildも終端状態まで確認し、保留後の試験Buildが配備前に止まることを確かめる。
2. rootと旧APIの全家計リクエスト・認証発行を停止する。ブラウザのメンテナンス表示だけでなく、直接HTTPと別ホストからも到達不能であることを確認する。新しい実装のフラグだけでは古いVersionを停止できない。
3. Previewの停止はversioned URLとalias URLの両方へ効く設定を使う。CloudflareのPreview URLs無効化は両方のroutingを止める。ただしworkers.dev本体とCustom Domainは別途確認する。Dashboardでの変更は次のWrangler配備で戻り得るため、切替用の設定と整合させる。[Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)、[workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
4. AIの新規実行を止め、稼働中リクエストの終了とlease期限を確認する。期限切れだけを遅延書込が不可能な証拠にしない。古い処理からDBへ書込できない状態を確定する。
5. 停止中の最新バックアップを取得し、切替直前にHEAD一致・30分以内・全復元検証を再確認する。古いPR HEADのPASSを流用しない。
6. 0011の最終NULL補完・キー/trigger切替を適用し、schema・保持値・FK・immutable保護を検証する。失敗時は停止を維持する。世帯非対応コードを再開しない。
7. 同じ対象SHAの世帯対応rootを配備する。旧API Workerは未使用のため配備対象にせず、DBへ到達できない状態を維持する。旧Previewへの到達を実URLで再確認する。
8. 配備後も全入口の停止を維持する。0011完了時点では再開せず、そのまま段階4へ進む。

## 段階4と切り戻し

1. 全入口の停止を維持し、配備版が世帯対応版だけであること、不明所属・必要所属NULL・越境参照が0件であることを確認して0012を適用する。
2. 制約・全保持値・FK・immutable保護を検査する。0012失敗時は0011のschemaと値へのrollbackを確認し、停止を維持する。旧版を再開しない。
3. 0012成功後、公開入口の停止を維持した管理下の確認経路で、既存セッション・既存パスキー・パスワード・一覧・明細編集・コピー・AI・振込の既存世帯smokeを実施する。本番へ架空世帯を追加しない。
4. smoke成功後、記録した世帯対応Versionだけに100%配分して公開入口を再開する。Version・DB UUID・対象SHAを記録し、旧入口が停止したままであることを再確認する。
5. 再開後の確認が成功してからGit自動デプロイを再開する。

0009/0010は旧SQLと互換だが、0011後は旧版へコードだけ戻さない。移行失敗はまずmigrationのrollback状態を確認し、成功済みの非互換切替後は対応版の修正を優先する。バックアップ/Time Travelからの復元は新規書込を失う可能性があるため、対象時点・影響・再照合を提示し、別の明示承認を得て行う。自動復元しない。
