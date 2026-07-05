import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// ISR/SSG不使用（全ページ動的レンダリング + fetchはcache:'no-store'）のため、
// incremental cacheは未設定（no-op）。将来ISRを導入する場合はR2 incremental cacheを追加する。
export default defineCloudflareConfig()
