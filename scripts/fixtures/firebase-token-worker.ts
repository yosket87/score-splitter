import { createFirebaseTokenVerifierForTesting } from '../../src/lib/auth/firebase-token'
import { createFirebaseFixtureFetch, createFirebaseTokenFixture, firebaseFixtureConfig, firebaseFixtureNow } from '../../tests/helpers/firebase-token'

const worker = {
  async fetch(): Promise<Response> {
    const fixture = createFirebaseFixtureFetch()
    const verify = createFirebaseTokenVerifierForTesting({ fetch: fixture.fetch, now: () => firebaseFixtureNow * 1000 })
    const validIdentity = await verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)
    let invalidSignature = 'accepted'
    try { await verify(await createFirebaseTokenFixture({ invalidSignature: true }), firebaseFixtureConfig) }
    catch { invalidSignature = 'rejected' }
    return Response.json({ validIdentity, invalidSignature })
  },
}

export default worker
