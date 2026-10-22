import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

// Miniflare 5の公開変換APIで、既存fixtureのWorker設定を引き継ぐ。
// 永続化が必要なfixtureはresourcePersistencePathを明示し、未指定なら一時領域を使う。
export function createMiniflare(options) {
  return new Miniflare(convertV4MiniflareOptions(options))
}
