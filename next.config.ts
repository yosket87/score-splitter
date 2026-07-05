import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// next dev 時にCloudflareバインディングのローカルプロキシを有効化（本番ビルドには影響しない）。
// USE_MOCKS=true（MSWモックでのdev/E2E実行）ではスキップする:
// OpenNextのdev初期化がinstrumentationで起動するMSWのfetchパッチと競合し、
// Worker APIへのリクエストがモックを素通りして実DNS解決に落ちる（CIでmock-worker.localのEAI_AGAINハング）。
if (process.env.USE_MOCKS !== "true") {
  initOpenNextCloudflareForDev();
}
