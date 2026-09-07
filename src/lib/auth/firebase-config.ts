import 'server-only'
import type { FirebaseClientConfig } from './firebase-client-config'
import { isFirebaseMockEnabled } from '@/lib/mock-mode'

export interface FirebaseAuthConfig {
  origin: string
  client: FirebaseClientConfig
}

export function firebaseAuthConfig(): FirebaseAuthConfig | null {
  if (isFirebaseMockEnabled()) return { origin: 'http://localhost:3000', client: {
    projectId: 'yamawake-mock', apiKey: 'local-fixture', authDomain: 'yamawake-mock.firebaseapp.com',
    googleEnabled: true, appleEnabled: true, mock: true,
  } }
  const projectId: string | undefined = process.env.FIREBASE_PROJECT_ID
  const apiKey: string | undefined = process.env.FIREBASE_API_KEY
  const authDomain: string | undefined = process.env.FIREBASE_AUTH_DOMAIN
  const origin: string | undefined = process.env.FIREBASE_AUTH_ORIGIN
  const googleFlag: string | undefined = process.env.FIREBASE_GOOGLE_ENABLED
  const appleFlag: string | undefined = process.env.FIREBASE_APPLE_ENABLED
  const googleEnabled = googleFlag === 'true'
  const appleEnabled = appleFlag === 'true'
  const customAuthDomainAllowed = projectId === 'yamawake-prod' && authDomain === 'auth.yamawake.app'
    && origin === 'https://app.yamawake.app'
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || !apiKey?.trim() ||
    !authDomain || (authDomain !== `${projectId}.firebaseapp.com` && !customAuthDomainAllowed) ||
    !origin || (!googleEnabled && !appleEnabled)) return null
  try {
    const url = new URL(origin)
    const local = process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs'
      && origin === 'http://localhost:3000'
    if (url.origin !== origin || (url.protocol !== 'https:' && !local)) return null
    return { origin, client: { projectId, apiKey, authDomain, googleEnabled, appleEnabled } }
  } catch { return null }
}

export function matchesFirebaseOrigin(headers: Headers, config: FirebaseAuthConfig): boolean {
  return headers.get('origin') === config.origin && headers.get('host') === new URL(config.origin).host
}
