'use client'

import { getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth'
import type { FirebaseClientConfig } from './firebase-client-config'

export type FirebaseLoginProvider = 'google.com' | 'apple.com'

export function getFirebaseAuth(config: FirebaseClientConfig) {
  const name = `yamawake-${config.projectId}`
  const existing = getApps().find(app => app.name === name)
  if (existing && (existing.options.apiKey !== config.apiKey || existing.options.authDomain !== config.authDomain)) {
    throw new Error('認証設定が更新されました。ページを再読み込みしてください。')
  }
  const app = existing ?? initializeApp({ projectId: config.projectId, apiKey: config.apiKey, authDomain: config.authDomain }, name)
  const auth = getAuth(app)
  auth.languageCode = 'ja'
  return auth
}

export function createFirebaseProvider(providerId: FirebaseLoginProvider, config: FirebaseClientConfig) {
  if (providerId === 'google.com' && config.googleEnabled) {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    return provider
  }
  if (providerId === 'apple.com' && config.appleEnabled) {
    const provider = new OAuthProvider('apple.com')
    provider.addScope('email')
    provider.addScope('name')
    return provider
  }
  throw new Error('このログイン方法はまだ利用できません。')
}

export function firebaseErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'ログインをキャンセルしました。'
  if (code === 'auth/popup-blocked') return 'ポップアップを許可して、もう一度お試しください。'
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/credential-already-in-use') {
    return '別のログイン方法に登録済みです。これまでの方法でログインし、設定から連携してください。'
  }
  return '認証を完了できませんでした。時間をおいてもう一度お試しください。'
}
