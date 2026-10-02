# iOS API v1

HTTPS `/api/v1`。全レスポンスはJSON、`Cache-Control: no-store`。Cookieを認証に使わない。BearerはFirebase ID tokenではなく交換した64桁のアプリセッショントークン。

| メソッド | パス | 本文 / 結果data |
|---|---|---|
| POST | /auth/exchange | `{ "idToken": "Firebase ID token", "mode": "login" }` → session |
| GET | /auth/session | session（tokenは省略） |
| POST | /auth/logout | `{ "loggedOut": true }`（当該セッションのみ削除） |
| GET | /months | `{ "months": [{ "month":"202610", "incomeTotal":300000, "expenseTotal":-100000, "balance":200000 }] }` |
| GET | /months/202610 | `{ "month":"202610", "incomes":[], "expenses":[], "carryovers":[], "monthBalance":{"incomeTotal":0,"expenseTotal":0,"balance":0}, "settlement":{ "totalIncome":0,"totalExpense":0,"husbandIncome":0,"wifeIncome":0,"husbandExpense":0,"wifeExpense":0,"husbandTotal":0,"wifeTotal":0,"allowance":0,"settlement":0 } }` |
| POST | /incomes, /expenses, /carryovers | 明細作成 → 明細 |
| PUT | /incomes/:id, /expenses/:id, /carryovers/:id | 明細更新 → 明細（月変更不可） |
| DELETE | 同上 | `{ "deleted":true }` |
| PATCH | /expenses/:id, /carryovers/:id | `{ "isCarryover":true }` / `{ "isCleared":true }` → `{ "updated":true }` |

成功例: `{"data":{"token":"64桁の小文字16進数","householdId":"h1","person":"husband","authMethod":"firebase","userId":"u1","membershipId":"m1","sessionEpoch":0,"expiresAt":"2026-10-01T01:00:00.000Z"}}`。
作成本文: `{"month":"202610","label":"給与","amount":300000,"person":"husband"}`。更新ではmonthを送らない。支出にはisCarryover、繰越にはisClearedを指定できる（省略時false）。金額入力は1〜999999999の正整数、返却は収入正・支出/繰越負。labelは1〜255文字。世帯IDは本文に指定不可。

認証更新: 失効前にFirebase SDKでID tokenを更新し、現在のアプリBearerを付けて`POST /auth/exchange`へ`{"idToken":"更新ID token","mode":"refresh"}`を送る。成功後は新しいアプリtokenへ差し替える（旧tokenは無効）。期限切れ後のrefreshは401。再認証後mode loginで交換する。loginはauth_timeが5分以内。Google/Appleの有効設定と署名・account確認、D1所属・失効境界を適用する。

未知UIDは409 `web_link_required`。Webで初回連携/承認手続きを完了して再試行する。移行用秘密や未使用の成功sessionは返さない。

失敗例: `{"error":{"code":"unauthorized","message":"認証が必要です"}}`。400 invalid_input、401 unauthorized、404 not_found、409 web_link_required、413 body_too_large、429 rate_limited、503 unavailable。本文は最大20KiB（ストリーム実測）、JSONのみ。APIは未設定時503。世帯は検証したセッションからのみ導出し、他世帯IDの変更は404。月一覧は繰越のみの月も含む。

月詳細の `monthBalance` はWebと同じ `calculateMonthBalance` の結果。全支出（繰越扱いも含む）を対象にし、繰越レコードは除外する。`settlement` は非繰越支出と清算済み繰越を対象にするため、月収支と精算用収支は異なりうる。クライアントはそれぞれのサーバー結果を表示し、計算を重複実装しない。
