'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { FirebaseClientConfig } from '@/lib/auth/firebase-client-config'

const FirebaseClientContext = createContext<FirebaseClientConfig | null>(null)

export function FirebaseClientProvider({ config, children }: { config: FirebaseClientConfig | null; children: ReactNode }) {
  return <FirebaseClientContext value={config}>{children}</FirebaseClientContext>
}

export function useFirebaseClientConfig() {
  return useContext(FirebaseClientContext)
}
