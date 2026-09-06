// Secretの値は環境ごとにWranglerで設定し、varsやクライアントには含めない。
interface CloudflareEnv { GOOGLE_OAUTH_CLIENT_SECRET?: string }
