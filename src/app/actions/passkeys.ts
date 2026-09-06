'use server'

import { cookies } from 'next/headers'
import { assertExistingLoginHousehold } from '@/lib/api/households'
import { assertHouseholdContext } from '@/lib/household-context'
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
  deleteExpiredChallenges,
  deletePasskey as deletePasskeyByApi,
  consumeChallenge,
  findAuthenticationCredential,
  listPasskeys as listPasskeysByApi,
  updatePasskeyCounter,
} from '@/lib/api/passkeys'
import { PERSON_LABELS } from '@/lib/constants'
import { getWebAuthnConfig } from '@/lib/webauthn/config'
import { createSession, getSession } from '@/lib/webauthn/session'
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
    const context = await getSession()
    if (!context) {
      return { success: false, error: '認証が必要です' }
    }

    const config = getWebAuthnConfig()
    const existingCredentials = await listPasskeysByApi(context, person)
    const userID = new TextEncoder().encode(`${context.householdId}:${person}`)

    const options = await generateRegOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: PERSON_LABELS[person],
      userDisplayName: PERSON_LABELS[person],
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

    const challenge = await createChallenge({ type: 'registration', context }, {
      challenge: options.challenge,
      person,
      expiresAt: createChallengeExpiry(),
    })
    await setChallengeCookie('registration', challenge.id)
    await deleteExpiredChallenges(new Date().toISOString())

    return { success: true, data: JSON.parse(JSON.stringify(options)) }
  } catch (err) {
    console.error('[generateRegistrationOptions]', err)
    return {
      success: false,
      error: '登録オプションの生成に失敗しました',
    }
  }
}

export async function verifyRegistration(
  person: Person,
  credential: RegistrationResponseJSON,
  deviceName?: string
): Promise<ActionResult<{ credentialId: string }>> {
  try {
    const context = await getSession()
    if (!context) {
      return { success: false, error: '認証が必要です' }
    }

    const config = getWebAuthnConfig()
    const id = await takeChallengeCookie('registration')
    const challengeRecord = id ? await consumeChallenge({ type: 'registration', context }, id, person) : null

    if (!challengeRecord) {
      return { success: false, error: 'チャレンジが見つかりません。もう一度お試しください' }
    }

    if (!Number.isFinite(Date.parse(challengeRecord.expiresAt)) || Date.parse(challengeRecord.expiresAt) <= Date.now()) {
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

    await createPasskeyByApi(context, {
      id: registeredCredential.id,
      person,
      publicKeyBase64: Buffer.from(registeredCredential.publicKey).toString('base64'),
      counter: registeredCredential.counter,
      deviceName: deviceName ?? (credentialBackedUp ? 'クラウド同期' : 'デバイス'),
      transports: credential.response.transports ?? [],
    })


    return { success: true, data: { credentialId: registeredCredential.id } }
  } catch (err) {
    console.error('[verifyRegistration]', err)
    return {
      success: false,
      error: '登録の検証に失敗しました',
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

    const challenge = await createChallenge({ type: 'authentication' }, {
      challenge: options.challenge,
      person: null,
      expiresAt: createChallengeExpiry(),
    })
    await setChallengeCookie('authentication', challenge.id)
    await deleteExpiredChallenges(new Date().toISOString())

    return { success: true, data: JSON.parse(JSON.stringify(options)) }
  } catch (err) {
    console.error('[generateAuthenticationOptions]', err)
    return {
      success: false,
      error: '認証オプションの生成に失敗しました',
    }
  }
}

export async function verifyAuthentication(
  credential: AuthenticationResponseJSON
): Promise<ActionResult<{ person: Person }>> {
  try {
    const config = getWebAuthnConfig()
    const storedCredential = await findAuthenticationCredential(credential.id)

    if (!storedCredential) {
      return { success: false, error: '登録されていないパスキーです' }
    }

    const id = await takeChallengeCookie('authentication')
    const challengeRecord = id ? await consumeChallenge({ type: 'authentication' }, id, null) : null

    if (!challengeRecord) {
      return { success: false, error: 'チャレンジが見つかりません。もう一度お試しください' }
    }

    if (!Number.isFinite(Date.parse(challengeRecord.expiresAt)) || Date.parse(challengeRecord.expiresAt) <= Date.now()) {
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

    const context = { householdId: storedCredential.householdId }
    assertHouseholdContext(context)
    await assertExistingLoginHousehold(context)
    await updatePasskeyCounter(
      context, storedCredential.id,
      verification.authenticationInfo.newCounter
    )

    const person = storedCredential.person
    await createSession(context, person, 'passkey')

    return { success: true, data: { person } }
  } catch (err) {
    console.error('[verifyAuthentication]', err)
    return {
      success: false,
      error: '認証の検証に失敗しました',
    }
  }
}

// --- 管理 ---

export async function listPasskeys(): Promise<ActionResult<PasskeyInfo[]>> {
  const context = await getSession()
  if (!context) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    const passkeys = await listPasskeysByApi(context)
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
    console.error('[listPasskeys]', error)
    return {
      success: false,
      error: 'パスキー一覧の取得に失敗しました',
    }
  }
}

export async function deletePasskey(
  credentialId: string
): Promise<ActionResult> {
  const context = await getSession()
  if (!context) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    await deletePasskeyByApi(context, credentialId)
    return { success: true }
  } catch (error) {
    console.error('[deletePasskey]', error)
    return {
      success: false,
      error: 'パスキーの削除に失敗しました',
    }
  }
}

function createChallengeExpiry(): string {
  return new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000).toISOString()
}

async function setChallengeCookie(type: 'registration' | 'authentication', id: string) {
  (await cookies()).set(`webauthn_${type}`, id, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    maxAge: CHALLENGE_TTL_MINUTES * 60, path: '/',
  })
}

async function takeChallengeCookie(type: 'registration' | 'authentication') {
  const store = await cookies()
  const name = `webauthn_${type}`
  const id = store.get(name)?.value
  store.delete(name)
  return id
}
