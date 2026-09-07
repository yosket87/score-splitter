import { createFirebaseTokenVerifierForTesting, FirebaseVerificationError } from '../../src/lib/auth/firebase-token'
import { createFirebaseTokenFixture, firebaseFixtureConfig, firebaseFixtureNow } from '../../tests/helpers/firebase-token'

const worker = {
  async fetch(request: Request): Promise<Response> {
    // workerdの実fetchでオプション検査とリダイレクト制御も検証する。
    const verify = createFirebaseTokenVerifierForTesting({ fetch: (input, init) => fetch(input, init), now: () => firebaseFixtureNow * 1000 })
    if (new URL(request.url).pathname === '/reject') {
      try {
        await verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)
        return Response.json({ rejected: false })
      } catch (error) {
        if (!(error instanceof FirebaseVerificationError)) throw error
        return Response.json({ rejected: true, stage: error.stage })
      }
    }
    const validIdentity = await verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)
    let invalidSignature = 'accepted'
    try { await verify(await createFirebaseTokenFixture({ invalidSignature: true }), firebaseFixtureConfig) }
    catch { invalidSignature = 'rejected' }
    return Response.json({ validIdentity, invalidSignature })
  },
}

export default worker
