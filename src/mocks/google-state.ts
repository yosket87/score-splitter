export interface MockAttempt { id: string; stateHash: string; browserHash: string; nonce: string | null; codeVerifier: string | null; sequence: number; status: string; claimId?: string; expiresAt: string }
export interface MockMigration { requestId: string; subject: string; email: string; browserHash: string; codeHash: string; expiresAt: string; status: string; purpose: 'legacy_enrollment' | 'identity_recovery' }
interface GoogleState { sequence: number; attempts: MockAttempt[]; requests: MockMigration[] }
const shared = globalThis as typeof globalThis & { __googleUiState?: GoogleState }
export function googleState(): GoogleState { return shared.__googleUiState ??= { sequence: 0, attempts: [], requests: [] } }
export function resetGoogleState() { shared.__googleUiState = undefined }
