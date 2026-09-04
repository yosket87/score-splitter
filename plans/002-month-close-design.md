# Plan 002: 精算完了・月締めの保存と再編集を設計する

> これは設計スパイクであり、本番コードを変更する計画ではない。成果物は `plans/002-month-close-spec.md` と `plans/002-month-close-implementation.md`。不確定なDB/API仕様を推測で実装しない。
> 最初に `git diff --stat 03ef7db..HEAD -- src/app/actions src/lib/api src/lib/utils src/types src/features cloudflare/worker/src cloudflare/worker/migrations` と未コミット差分を確認し、下記抜粋と照合する。

## Status

- Priority: P1
- Effort: 設計M（半日〜1日）、後続実装L（数日以上、設計後に再見積もり）
- Risk: HIGH（締めた記録・実支払額・並行更新の整合性）
- Depends on: 設計開始は依存なし。画面への実装は001の後を推奨。
- Category: direction
- Planned at: `03ef7db`, 2026-09-04
- Status: TODO

## 目的と採用済みの条件

ヤマワケは夫婦の収入から支出を控除して余剰を均等に分け、夫婦間の精算額を表示する。利用者は「精算完了・月締め」と「精算額の内訳」を採用し、現行デザインの維持を求めた。項目名だけ入力して金額を後から入れるケースがほぼないため、未入力管理・テンプレートは不要と明言した。

月締めは実際に支払いを済ませたことを記録し、その時点の精算額と元データを後から確認できるようにする。外部送金・銀行接続は行わない。

## 現状と根拠

- `src/types/index.ts` の `CalculationResult` は数値だけで、月の完了状態や支払日はない。既存月はすべて未締めとして移行する。
- `src/lib/utils/calculation.ts` は次を返す。

```ts
const husbandTotal = husbandIncome + husbandExpense
const wifeTotal = wifeIncome + wifeExpense
const allowance = (totalIncome + totalExpense) / 2
const settlement = husbandTotal - allowance
```

`settlement` の正は夫→妻、負は妻→夫。0は精算不要。支出に `isCarryover`、繰越に `isCleared` がある。後者は「今月の精算に算入する」意味であり、月の送金完了を表すフラグとして流用しない。

- `src/lib/utils/format.ts` は `Math.floor(Math.abs(value))` で表示する。整数の記録でも均等割りで0.5円が出る。表示額、理論精算額、実際の支払記録を区別する必要がある。
- `src/app/[year]/[month]/page.tsx` は `requireAuth()` 後に収入・支出・繰越を取得し、`MonthlyOverview` と3種類の明細に渡す。
- `src/app/actions/entry-helpers.ts` の変更処理は次の戻り値形式。

```ts
const data = await mutate()
revalidateHouseholdData(month)
return { success: true, data }
```

- `src/lib/api/client.ts` はサーバー側からWorker APIを呼び、`cache: 'no-store'` と `ApiError.status` を使う。
- `cloudflare/worker/src/records.ts` は作成、ID指定更新、削除、フラグ更新を行う。例:

```ts
await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
```

クライアントから届く月文字列ではなく、DBのレコードが所属する月を使って締め状態を確認する必要がある。

- `cloudflare/worker/src/copy-month.ts` は置換時にコピー先のレコードを削除し、最後に `db.batch(statements)` で投入する。通常CRUDだけにガードを追加しても置換コピーから変更できてしまう。
- `cloudflare/worker/src/d1.ts` が公開するDBインターフェースは `prepare` と `batch`。存在しないトランザクションAPIを仮定しない。

## 推奨する最小の操作仕様（設計時に確定する）

1. 状態はまず「未締め」「締め済み」の2つ。別途「入力済み」「承認待ち」「未入力」状態を作らない。
2. 左の既存要約カードに「精算済みにして月を締める」を追加する。確認ダイアログにサーバー計算による方向・支払記録額・支払日を表示する。操作は実際の送金を発生させないことが分かる文言にする。
3. 金額0の月は送金を求めず「精算不要として月を締める」。支払日は不要。データ取得失敗を0円として扱わない。
4. 締め済みでは既存の黒い精算額と青い方向表示を維持し、小さな「精算済み」または「精算不要・月締め済み」、支払日、締め状態を追加する。収入・支出・繰越の一覧は表示し続ける。
5. 締め済み月への追加、編集、削除、繰越フラグ変更、コピー先への書き込みをUIとWorkerの両方で止める。読み取り、CSV、締め済み月をコピー元にする操作は許可する。
6. 修正は「修正するため月を開き直す」から確認して行う。開き直しは既に行った送金の取消しではない。過去の締め記録・支払記録を消さない。
7. 端数と再精算の推奨案は以下。最終仕様では根拠とテスト例を併記する。
   - 理論額は精度を落とさず保存し、実支払額は整数円で記録する。初回は現行表示と一致する絶対値の切捨てを候補にし、どちらに1円残るかを説明する。計算関数そのものは変更しない。
   - 再開後は新たな目標精算額と既存の正味支払額の差を追加精算として確認する。旧金額全額を再度送金する誘導をしない。逆方向の差額、誤操作で完了登録しただけの場合の訂正方法も設計する。
8. 世帯共通パスワードログインでは `Session.person` がnullになり得る。本人確認できない操作者を「夫が承認」「妻が承認」と記録しない。双方承認ワークフローは作らない。

## デザイン制約

参考は `public/lp/monthly-dashboard-preview.png` と現コード。デスクトップは左要約／右明細、375pxでは1カラム。既存ヘッダー、青とローズの担当者、黒い金額、ガラス背景、グラフを保持する。生成画像の全要素を仕様として扱わない。例えば締め済み月にもコピー先変更ボタンが描かれていても、実装では無効化する。

## Scope

今回変更可能なファイル:
- `plans/002-month-close-spec.md`（新規: 状態遷移・画面・データ/API契約・検証表）
- `plans/002-month-close-implementation.md`（新規: 実装担当向けの段階別計画）
- `plans/README.md` と本計画の進捗

調査対象:
- `src/types/index.ts`, `src/lib/utils/calculation.ts`, `src/lib/utils/format.ts`
- `src/app/[year]/[month]/page.tsx`, `src/features/monthly-overview/`, `src/features/income/`, `src/features/expense/`, `src/features/carryover/`, `src/features/add-entry/`, `src/features/copy-month/`
- `src/app/actions/`, `src/lib/api/`, `src/lib/webauthn/session.ts`
- `cloudflare/worker/src/`, `cloudflare/worker/migrations/`, `tests/unit/cloudflare/`, `tests/integration/`, `src/mocks/`

対象外: この段階のソース変更・本番DB操作・デプロイ・課金・マルチテナント化・外部送金・通知送信・未入力管理・月コピーの従来金額仕様変更。

## コマンドと検証基盤

| 目的 | コマンド | 期待結果 |
|---|---|---|
| ベースライン | `npm run test:run -- tests/unit/calculation.test.ts tests/unit/cloudflare/records.test.ts tests/unit/cloudflare/worker.test.ts tests/integration/actions/copy-month.test.ts` | 全件成功。既存失敗は別記 |
| 更新経路の列挙 | `rg -n 'createRecord|updateRecord|deleteRecord|patchRecordFlag|insertRecordStatement|copyMonthData' cloudflare/worker/src` | 各経路を仕様のガード表へ対応付け |
| 型検証（実装時） | `npx tsc --noEmit --incremental false` | exit 0 |
| Lint（実装時） | `npm run lint` | exit 0 |
| 全体（実装時） | `npm run test:coverage` | 全件成功、80%以上基準を維持 |
| ビルド（実装時） | `npm run build` | exit 0 |
| ブラウザ（実装時） | `npm run test:e2e` | 全件成功 |
| モック表示（実装時） | `npm run dev:mock` | localhost:3000、既存モックログインで検証 |

計画作成時点でテストは未実行。実D1の並行更新検証のコマンドは設計スパイクでローカル専用に具体化し、後続計画へ記載する。本番への接続は禁止。

## 手順

### 1. 状態と計算例を確定する
`plans/002-month-close-spec.md` に「状態遷移」「画面仕様」「端数」「再開と追加精算」を作る。通常・逆方向・0円・赤字・奇数円・再開・再締め・誤った支払登録の訂正を、入力と期待結果の表にする。

例: 初回の正味支払15,500円（夫→妻）、再計算後の目標20,000円なら追加4,500円。目標10,000円なら妻→夫5,500円。入力101円・支出0円なら理論50.5円と記録する整数支払額を明確に区別する。支払日の保存は日付のみ、処理日時はUTC、初期表示は日本時間を候補とする。

検証: `rg -n '^## (状態遷移|画面仕様|端数|再開と追加精算)' plans/002-month-close-spec.md` → 4見出しあり。表の数字を手計算と既存計算関数で照合して記録。

### 2. 保存・更新・並行性を設計する
同仕様に「データ契約」「API契約」「更新経路と競合」「テスト表」を追加する。

- 月の状態／世代、締め時の計算結果、入力スナップショットまたは対応する不変リビジョン、支払記録、再開履歴の保存案を選ぶ。後から現データを再集計しただけの数字を「当時の確定額」と呼ばない。
- APIは状態取得、締め、再開、必要な支払訂正を定義する。認証、Zod検証、HTTPステータス、既存ActionResultへの変換、再検証する月を記載する。
- 全書込経路に対して、締め済みへの変更拒否と対象月の導出を表にする。IDだけの更新・削除、繰越フラグ、コピーのadd/skip/replaceを含める。
- 締め前の読み取りと書き込みの間に別の編集が入る競合を防ぐ仕組みを選ぶ。単なる事前SELECTと後続UPDATEでは不十分。月リビジョン、条件付きSQL、DB制約などを比較し、D1で使える方式を公式資料とローカル検証で確認する。
- 二重送信、応答消失後の再送、別端末の締め／編集／再開競合は二重支払記録を作らず、古い画面には再確認を求める。冪等キーと対象リビジョンの契約を具体化する。
- 締め済み月の再開で、既に後続月へコピーした繰越を自動修正しない。影響の説明・検出が必要かを記載し、後続月の精算を暗黙に書き換えない。

検証: 上表の経路列挙コマンドの各結果がガード表に載ることを照合。`rg -n '^## (データ契約|API契約|更新経路と競合|テスト表)' plans/002-month-close-spec.md` → 4見出しあり。ローカルで確認できない並行性の保証は未検証と記す。

### 3. 実装引き継ぎ計画へ分解する
`plans/002-month-close-implementation.md` を作り、DB／Worker、Server Actionsとクライアント、現行UI、モックとE2Eへ段階分割する。各段階の正確な変更可能ファイル、RED→GREENのテスト名、コマンドと期待結果、移行順序、失敗時の復旧、所要時間を記載する。実装開始時点のSHAでドリフト確認を定義する。

テストは既存 `tests/unit/cloudflare/records.test.ts`、`tests/integration/actions/copy-month.test.ts`、`tests/components/features/monthly-overview.test.tsx` を構造の見本にする。モックが返す値だけではDB排他を保証できないため、ローカル実D1検証を通常Unitと分離する。

UIは375px／1280px、ライト／ダーク、未締め／締め済み／再開／0円／通信失敗を検証。コードレビューでは支払額の二重記録、認証、全更新経路の拒否を優先する。

検証: `test -s plans/002-month-close-implementation.md` → exit 0。記載した全コマンドを既存設定または追加予定の明示的なスクリプトに対応付ける。

## 完了条件（設計段階）

- [ ] `test -s plans/002-month-close-spec.md` と `test -s plans/002-month-close-implementation.md` が成功。
- [ ] 状態と端数・再開例の期待値が記載され、確認結果がある。
- [ ] 全更新経路がガード表にあり、並行実行の方式と検証方法が具体化されている。
- [ ] 後続計画に正確なファイル範囲、テスト・コマンド・移行順序・停止条件がある。
- [ ] `git diff --name-only` に今回の範囲外変更がない。
- [ ] 未解決の仕様を採用済みとして扱わず、`plans/README.md` の状態に反映する。

## STOP条件

実装に進む前に以下が判明したら設計段階で報告する。
- 端数または再精算で、記録額と利用者が実際に送った額を整合させられない。
- D1で締め・編集の並行性を保証する方式を検証できない。
- 保存した履歴と現データを区別できない設計になる。
- 未入力管理、外部送金、全家計の別モデル化が必要になる。

## Gitと保守

実装時は機能ブランチを作成し、mainへ直接プッシュしない。例: `feat: 月の精算完了と再開を記録`。コミット・PRは日本語、生成情報なし。プッシュ・PRは依頼された場合のみ。

新しい書込経路を追加するときは月締めの拒否テストも追加する。計算仕様変更時は過去の確定スナップショットを再計算で上書きしない。月締めの完了は外部金融機関の支払確認ではなく、利用者が記録した完了である。
