'use server'

import {
  generateRegistrationOptions as generateRegOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions as generateAuthOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server'
import {
  createChallenge,
  createPasskey as createPasskeyByApi,
  deleteChallenges,
  deleteExpiredChallenges,
  deletePasskey as deletePasskeyByApi,
  getLatestChallenge,
  getPasskey,
  listPasskeys as listPasskeysByApi,
  updatePasskeyCounter,
} from '@/lib/api/passkeys'
import { getWebAuthnConfig } from '@/lib/webauthn/config'
import { createSession, isAuthenticated } from '@/lib/webauthn/session'
import type { ActionResult, Person } from '@/types'

const CHALLENGE_TTL_MINUTES = 5

export interface PasskeyInfo {
  id: string
  person: Person
  deviceName: string | null
  createdAt: string
}

// --- 登録 ---

export async function generateRegistrationOptions(
  person: Person
): Promise<ActionResult<PublicKeyCredentialCreationOptionsJSON>> {
  try {
    if (!(await isAuthenticated())) {
      return { success: false, error: '認証が必要です' }
    }

    const config = getWebAuthnConfig()
    const existingCredentials = await listPasskeysByApi(person)
    const userID = new TextEncoder().encode(person)

    const options = await generateRegOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: person === 'husband' ? '夫' : '妻',
      userDisplayName: person === 'husband' ? '夫' : '妻',
      userID,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.id,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    })

    await createChallenge({
      challenge: options.challenge,
      type: 'registration',
      person,
      expiresAt: createChallengeExpiry(),
    })
    await deleteExpiredChallenges(new Date().toISOString())

    return { success: true, data: JSON.parse(JSON.stringify(options)) }
  } catch (err) {
    console.error('[generateRegistrationOptions]', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : '登録オプションの生成に失敗しました',
    }
  }
}

export async function verifyRegistration(
  person: Person,
  credential: RegistrationResponseJSON,
  deviceName?: string
): Promise<ActionResult<{ credentialId: string }>> {
  try {
    if (!(await isAuthenticated())) {
      return { success: false, error: '認証が必要です' }
    }

    const config = getWebAuthnConfig()
    const challengeRecord = await getLatestChallenge({
      type: 'registration',
      person,
    })

    if (!challengeRecord) {
      return { success: false, error: 'チャレンジが見つかりません。もう一度お試しください' }
    }

    if (new Date(challengeRecord.expiresAt) < new Date()) {
      return { success: false, error: 'チャレンジの有効期限が切れました。もう一度お試しください' }
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: false,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: 'パスキーの検証に失敗しました' }
    }

    const { credential: registeredCredential, credentialBackedUp } =
      verification.registrationInfo

    await createPasskeyByApi({
      id: registeredCredential.id,
      person,
      publicKeyBase64: Buffer.from(registeredCredential.publicKey).toString('base64'),
      counter: registeredCredential.counter,
      deviceName: deviceName ?? (credentialBackedUp ? 'クラウド同期' : 'デバイス'),
      transports: credential.response.transports ?? [],
    })

    await deleteChallenges({ type: 'registration', person })

    return { success: true, data: { credentialId: registeredCredential.id } }
  } catch (err) {
    console.error('[verifyRegistration]', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : '登録の検証に失敗しました',
    }
  }
}

// --- 認証 ---

export async function generateAuthenticationOptions(): Promise<
  ActionResult<PublicKeyCredentialRequestOptionsJSON>
> {
  try {
    const config = getWebAuthnConfig()
    const options = await generateAuthOptions({
      rpID: config.rpID,
      userVerification: 'preferred',
    })

    await createChallenge({
      challenge: options.challenge,
      type: 'authentication',
      person: null,
      expiresAt: createChallengeExpiry(),
    })
    await deleteExpiredChallenges(new Date().toISOString())

    return { success: true, data: JSON.parse(JSON.stringify(options)) }
  } catch (err) {
    console.error('[generateAuthenticationOptions]', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : '認証オプションの生成に失敗しました',
    }
  }
}

export async function verifyAuthentication(
  credential: AuthenticationResponseJSON
): Promise<ActionResult<{ person: Person }>> {
  try {
    const config = getWebAuthnConfig()
    const storedCredential = await getPasskey(credential.id)

    if (!storedCredential) {
      return { success: false, error: '登録されていないパスキーです' }
    }

    const challengeRecord = await getLatestChallenge({
      type: 'authentication',
      person: null,
    })

    if (!challengeRecord) {
      return { success: false, error: 'チャレンジが見つかりません。もう一度お試しください' }
    }

    if (new Date(challengeRecord.expiresAt) < new Date()) {
      return { success: false, error: 'チャレンジの有効期限が切れました。もう一度お試しください' }
    }

    const publicKeyBytes = Buffer.from(storedCredential.publicKeyBase64, 'base64')
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: false,
      credential: {
        id: storedCredential.id,
        publicKey: new Uint8Array(publicKeyBytes),
        counter: storedCredential.counter,
        transports: storedCredential.transports as AuthenticatorTransportFuture[],
      },
    })

    if (!verification.verified) {
      return { success: false, error: 'パスキーの認証に失敗しました' }
    }

    await updatePasskeyCounter(
      storedCredential.id,
      verification.authenticationInfo.newCounter
    )
    await deleteChallenges({ type: 'authentication', person: null })

    const person = storedCredential.person
    await createSession(person, 'passkey')

    return { success: true, data: { person } }
  } catch (err) {
    console.error('[verifyAuthentication]', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : '認証の検証に失敗しました',
    }
  }
}

// --- 管理 ---

export async function listPasskeys(): Promise<ActionResult<PasskeyInfo[]>> {
  if (!(await isAuthenticated())) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    const passkeys = await listPasskeysByApi()
    return {
      success: true,
      data: passkeys.map((row) => ({
        id: row.id,
        person: row.person,
        deviceName: row.deviceName,
        createdAt: row.createdAt,
      })),
    }
  } catch (error) {
    return {
      success: false,
      error: `パスキー一覧の取得に失敗しました: ${
        error instanceof Error ? error.message : '不明なエラー'
      }`,
    }
  }
}

export async function deletePasskey(
  credentialId: string
): Promise<ActionResult> {
  if (!(await isAuthenticated())) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    await deletePasskeyByApi(credentialId)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `パスキーの削除に失敗しました: ${
        error instanceof Error ? error.message : '不明なエラー'
      }`,
    }
  }
}

function createChallengeExpiry(): string {
  return new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000).toISOString()
}
