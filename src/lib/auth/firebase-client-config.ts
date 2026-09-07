// ブラウザへ渡してよい公開設定だけを定義する。
export interface FirebaseClientConfig {
  projectId: string
  apiKey: string
  authDomain: string
  googleEnabled: boolean
  appleEnabled: boolean
  mock?: boolean
}
