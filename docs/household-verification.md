# 世帯分離の検証記録

Issue #102の段階別証跡。2026-09-05時点、実装は進行中で本番リリース済みではない。テスト件数は各対象SHAでの結果を示す。

## 完了した検証

| 対象 | SHA | 結果 |
|---|---|---|
| 全業務表バックアップ復元 | f6fb77a | 対象110件、型検査・ESLint成功。行90.81%、分岐85.90%。独立レビューApproved |
| 0009/0010互換追加と初回補完 | ec09c41 | 対象34件、全体1093件、型・ESLint成功。SQLite/隔離Wranglerで保持値・rollback・再適用・FK・immutable検証。独立レビューApproved |
| 認証と試行分離 | 5355f56 | 全体1141件、型検査成功。認証対象行98.33%、分岐90.53%。ローカルChromium E2E3件成功 |
| 同一認証snapshot | ac0fe0a | 戻り値欠落をREDで確認後、対象16件・型検査成功。認証差分全体の独立レビューApproved |

認証E2Eでは、パスワードの成功/失敗と、仮想認証器の実署名による登録→再ログインを確認した。世帯付きuserHandle、challenge cookie消費も検証した。実環境のパスキー登録を行った証跡ではない。

## CIとPR Preview

| PR | 対象 | 結果 |
|---|---|---|
| #119 | 01947d8 | unit/type/lint、E2E、開発Workers Builds成功。E2E 4分32秒、test 2分2秒 |
| #120 | ec09c41 | payment-d1 33秒成功、開発/旧API Workers Builds成功。baseがmainではないため既存test/e2eは未起動。全体テストはローカルで成功 |

#119の実Branch Previewで未認証の`/login`への遷移とログイン画面を確認した。Keychainの開発用資格情報を使うログイン確認は明示承認待ち。資格情報を表示・記録していない。

#120では旧APIの自動Previewも生成され、本番D1のbindingを確認した。本番migrationは未適用、旧APIの本番配分は不変だった。後続pushには旧APIの非本番自動upload停止/隔離が必要。[切替手順と実環境差異](household-release-runbook.md)

## 残る必須検証

- 明細・全月集計・フラグ・コピーのA/B分離、foreign ID拒否、コピー元の変更競合、全書込の原子性。
- AIのcontext/lease/分類/結果/revisionと、振込のsnapshot/再送/訂正/取消の世帯分離。
- 0011/0012による世帯キー・FK・NOT NULL・trigger切替と、全既存値保持・途中rollback。
- 同月同額同担当同label/operation IDが共存する2世帯の実D1試験。
- クライアント状態、遅延応答、振込pending storage、CSV/グラフ/精算の世帯境界。
- 最終HEADで全体テスト・型・lint・build・E2E・実D1・コード/セキュリティレビュー。
- 独立開発DBでの全体確認、旧入口停止、対象本番HEADの新規バックアップPASSと明示承認。

## 非ブロッキングの指摘

バックアップ復元引数の二重定義、認証アダプターの長い一行書式、想定異常系のconsole.error出力は最終整理で判断する。Node SQLite実験機能・色指定競合・既存パスキーボタンのlint警告も区別して記録し、テスト失敗を警告として扱わない。
