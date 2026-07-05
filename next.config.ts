import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// next dev 時にCloudflareバインディングのローカルプロキシを有効化（本番ビルドには影響しない）
initOpenNextCloudflareForDev();
